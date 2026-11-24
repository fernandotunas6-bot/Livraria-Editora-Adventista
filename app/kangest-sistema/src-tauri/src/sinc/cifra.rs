// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

//! A cifra da ligação à base central da livraria (docs/KANGEST-SINCRONIZACAO.md, na raiz da livraria). É o mesmo
//! esquema da Edge Function (`supabase/functions/app/kangestSinc.ts`), com os mesmos vectores de teste:
//!
//! - cada pedido vai assinado com a chave Ed25519 deste posto: `kangest-sinc/1 \n posto \n hora \n nonce \n
//!   sha256(corpo)`;
//! - o corpo vai selado para o centro: uma chave X25519 efémera, o acordo com a chave pública do centro, HKDF-SHA256
//!   (sal = chave efémera ‖ chave do centro, info = «kangest-sinc/1») e AES-256-GCM, com os cabeçalhos como dados
//!   associados;
//! - a resposta vem selada com a segunda metade da mesma HKDF: só este pedido a abre.
//!
//! Tudo com o `ring`, que o KanGest já usa.

use base64::engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD};
use base64::Engine;
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::agreement::{agree_ephemeral, EphemeralPrivateKey, UnparsedPublicKey, X25519};
use ring::hkdf;
use ring::rand::{SecureRandom, SystemRandom};
use ring::signature::{Ed25519KeyPair, KeyPair};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

pub const VERSAO: &str = "kangest-sinc/1";

/// O envelope de um pedido, como a Edge Function o abre.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Envelope {
    pub v: u8,
    pub kid: String,
    pub epk: String,
    pub iv: String,
    pub ct: String,
}

/// A resposta selada do centro.
#[derive(Debug, Clone, Deserialize)]
pub struct Selado {
    pub iv: String,
    pub ct: String,
}

struct Comprimento(usize);

impl hkdf::KeyType for Comprimento {
    fn len(&self) -> usize {
        self.0
    }
}

fn falha(o_que: &str) -> AppError {
    AppError::msg(format!("Cifra da ligação à livraria: {o_que}."))
}

pub fn sha256_hex(dados: &[u8]) -> String {
    Sha256::digest(dados).iter().map(|b| format!("{b:02x}")).collect()
}

/// As chaves do pedido e da resposta a partir do segredo partilhado X25519.
pub fn chaves_da_sessao(partilhado: &[u8], epk: &[u8], centro: &[u8]) -> AppResult<([u8; 32], [u8; 32])> {
    let mut sal = Vec::with_capacity(epk.len() + centro.len());
    sal.extend_from_slice(epk);
    sal.extend_from_slice(centro);
    let prk = hkdf::Salt::new(hkdf::HKDF_SHA256, &sal).extract(partilhado);
    let info = [VERSAO.as_bytes()];
    let mut saida = [0u8; 64];
    prk.expand(&info, Comprimento(64)).and_then(|okm| okm.fill(&mut saida)).map_err(|_| falha("HKDF"))?;
    let mut pedido = [0u8; 32];
    let mut resposta = [0u8; 32];
    pedido.copy_from_slice(&saida[..32]);
    resposta.copy_from_slice(&saida[32..]);
    Ok((pedido, resposta))
}

fn chave_aes(chave: &[u8; 32]) -> AppResult<LessSafeKey> {
    Ok(LessSafeKey::new(UnboundKey::new(&AES_256_GCM, chave).map_err(|_| falha("chave AES"))?))
}

/// AES-256-GCM: o texto cifrado com a etiqueta no fim, como a WebCrypto.
pub fn cifrar(chave: &[u8; 32], iv: &[u8; 12], aad: &str, dados: &[u8]) -> AppResult<Vec<u8>> {
    let mut buf = dados.to_vec();
    chave_aes(chave)?
        .seal_in_place_append_tag(Nonce::assume_unique_for_key(*iv), Aad::from(aad.as_bytes()), &mut buf)
        .map_err(|_| falha("não foi possível cifrar"))?;
    Ok(buf)
}

pub fn decifrar(chave: &[u8; 32], iv: &[u8; 12], aad: &str, ct: &[u8]) -> AppResult<Vec<u8>> {
    let mut buf = ct.to_vec();
    let claro = chave_aes(chave)?
        .open_in_place(Nonce::assume_unique_for_key(*iv), Aad::from(aad.as_bytes()), &mut buf)
        .map_err(|_| AppError::msg("A resposta do site não se abre: foi alterada pelo caminho ou não é deste pedido."))?;
    Ok(claro.to_vec())
}

pub fn aad_do_pedido(posto: &str, hora: &str, nonce: &str) -> String {
    format!("{VERSAO}\n{posto}\n{hora}\n{nonce}")
}

pub fn aad_da_resposta(nonce: &str) -> String {
    format!("{VERSAO}\nresposta\n{nonce}")
}

/// O que este posto assina em cada pedido.
pub fn mensagem_assinada(posto: &str, hora: &str, nonce: &str, corpo: &[u8]) -> String {
    format!("{VERSAO}\n{posto}\n{hora}\n{nonce}\n{}", sha256_hex(corpo))
}

fn aleatorio<const N: usize>() -> AppResult<[u8; N]> {
    let mut b = [0u8; N];
    SystemRandom::new().fill(&mut b).map_err(|_| falha("sem números ao acaso do sistema"))?;
    Ok(b)
}

/// A semente da chave Ed25519 de um posto novo (32 bytes ao acaso).
pub fn nova_semente() -> AppResult<[u8; 32]> {
    aleatorio::<32>()
}

/// Um nonce de 32 caracteres (24 bytes ao acaso, base64 sem preenchimento: só letras, algarismos, «-» e «_»).
pub fn nonce() -> AppResult<String> {
    Ok(URL_SAFE_NO_PAD.encode(aleatorio::<24>()?))
}

fn par(semente: &[u8; 32]) -> AppResult<Ed25519KeyPair> {
    Ed25519KeyPair::from_seed_unchecked(semente).map_err(|_| falha("chave Ed25519"))
}

/// A chave pública Ed25519 (base64) que se regista no emparelhamento.
pub fn chave_publica(semente: &[u8; 32]) -> AppResult<String> {
    Ok(B64.encode(par(semente)?.public_key().as_ref()))
}

pub fn assinar(semente: &[u8; 32], mensagem: &str) -> AppResult<String> {
    Ok(B64.encode(par(semente)?.sign(mensagem.as_bytes()).as_ref()))
}

/// Sela o pedido para o centro; devolve o envelope e a chave que abre a resposta.
pub fn selar(centro_b64: &str, kid: &str, aad: &str, dados: &[u8]) -> AppResult<(Envelope, [u8; 32])> {
    let centro = B64.decode(centro_b64.trim()).map_err(|_| falha("a chave do site não é base64"))?;
    if centro.len() != 32 {
        return Err(falha("a chave do site não tem 32 bytes"));
    }
    let rng = SystemRandom::new();
    let efemera = EphemeralPrivateKey::generate(&X25519, &rng).map_err(|_| falha("chave efémera"))?;
    let epk = efemera.compute_public_key().map_err(|_| falha("chave efémera"))?.as_ref().to_vec();
    let partilhado = agree_ephemeral(efemera, &UnparsedPublicKey::new(&X25519, &centro), |s| s.to_vec()).map_err(|_| falha("acordo X25519"))?;
    let (pedido, resposta) = chaves_da_sessao(&partilhado, &epk, &centro)?;
    let iv = aleatorio::<12>()?;
    let ct = cifrar(&pedido, &iv, aad, dados)?;
    Ok((Envelope { v: 1, kid: kid.to_string(), epk: B64.encode(epk), iv: B64.encode(iv), ct: B64.encode(ct) }, resposta))
}

pub fn abrir_resposta(chave: &[u8; 32], nonce: &str, r: &Selado) -> AppResult<Vec<u8>> {
    let iv: [u8; 12] = B64.decode(r.iv.trim()).ok().and_then(|v| v.try_into().ok()).ok_or_else(|| falha("resposta sem iv"))?;
    let ct = B64.decode(r.ct.trim()).map_err(|_| falha("resposta inválida"))?;
    decifrar(chave, &iv, &aad_da_resposta(nonce), &ct)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn seq<const N: usize>(inicio: u8) -> [u8; N] {
        std::array::from_fn(|i| inicio.wrapping_add(i as u8))
    }
    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }
    const POSTO: &str = "00000000-0000-4000-8000-000000000001";

    // Os mesmos vectores de supabase/functions/app/kangestSinc.test.ts (calculados com a WebCrypto): se um dos
    // lados mudar, os dois testes falham.
    #[test]
    fn vectores_da_sessao() {
        let (pedido, resposta) = chaves_da_sessao(&seq::<32>(0x01), &seq::<32>(0x40), &seq::<32>(0x80)).unwrap();
        assert_eq!(hex(&pedido), "aca8ebc1dd701aa1814bcfc1c4588451cfdaef2e9b552e5b518efb3f41ef45b3");
        assert_eq!(hex(&resposta), "8fcd419a5ea44cd7f7708570740d7e9a7f650bd4379bf07db9f5234e41536b59");
        let ct = cifrar(&pedido, &seq::<12>(0xa0), &aad_do_pedido(POSTO, "1764000000", "abcdefghijklmnop"), br#"{"lote":[]}"#).unwrap();
        assert_eq!(B64.encode(ct), "h5lHHV5bMDz0HrYWewmePz6sxl47k0cH920P");
    }

    #[test]
    fn abre_a_resposta_que_a_edge_function_selou() {
        let (_, resposta) = chaves_da_sessao(&seq::<32>(0x01), &seq::<32>(0x40), &seq::<32>(0x80)).unwrap();
        let r = Selado { iv: "sLGys7S1tre4ubq7".into(), ct: "0nsRVGZjDVPBY7XcfrZj9bv1v83kJLfz/lkWY8Zatl7OykxXlMkkX9ShO1p/".into() };
        assert_eq!(abrir_resposta(&resposta, "abcdefghijklmnop", &r).unwrap(), br#"{"resultado":{"recebidos":2}}"#);
        // com o nonce de outro pedido, ou mexida, não abre
        assert!(abrir_resposta(&resposta, "outro-nonce-qualquer", &r).is_err());
        let mut ct = B64.decode(r.ct.as_bytes()).unwrap();
        ct[0] ^= 1;
        assert!(abrir_resposta(&resposta, "abcdefghijklmnop", &Selado { iv: r.iv.clone(), ct: B64.encode(ct) }).is_err());
    }

    #[test]
    fn assinatura_ed25519_igual_a_da_webcrypto() {
        let semente = seq::<32>(0x11);
        assert_eq!(chave_publica(&semente).unwrap(), "7VSln7GsOlEjk1E2KUG4aOhaYOPXskhdgogh3Hppwnk=");
        let msg = mensagem_assinada(POSTO, "1764000000", "abcdefghijklmnop", br#"{"v":1}"#);
        assert!(msg.ends_with("afbf9d0f3560b0fd7795e81c42a0a79ee6b6fc67e064f77826aee642cad28d91"));
        assert_eq!(
            assinar(&semente, &msg).unwrap(),
            "+xWVGmCQWUZ3QWIxeKA88x4mJ9ZLD0IOBrPbgu9DNDIiC5ccaBRC0L1zZjqdyInlo+nl+uqLV+b0ZAiNzm5SDw=="
        );
    }

    #[test]
    fn envelope_e_nonce() {
        let centro = B64.encode(seq::<32>(0x80));
        let (env, resposta) = selar(&centro, "1", "aad", br#"{"lote":[]}"#).unwrap();
        assert_eq!((env.v, env.kid.as_str()), (1, "1"));
        assert_eq!(B64.decode(env.epk.as_bytes()).unwrap().len(), 32);
        assert_eq!(B64.decode(env.iv.as_bytes()).unwrap().len(), 12);
        assert_eq!(B64.decode(env.ct.as_bytes()).unwrap().len(), br#"{"lote":[]}"#.len() + 16);
        // cada pedido tem a sua chave efémera e a sua chave da resposta
        let (outro, outra) = selar(&centro, "1", "aad", br#"{"lote":[]}"#).unwrap();
        assert_ne!(env.epk, outro.epk);
        assert_ne!(resposta, outra);
        assert!(selar("curta", "1", "aad", b"x").is_err());
        let n = nonce().unwrap();
        assert_eq!(n.len(), 32);
        assert!(n.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(n, nonce().unwrap());
    }
}
