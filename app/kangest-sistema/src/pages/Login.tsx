// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CloudOff, Globe, ShieldCheck } from "lucide-react";
import { NA_APP, call } from "@/lib/api";
import { useSession } from "@/store/session";
import type { Sessao } from "@/lib/types";
import { useOcultarValores } from "@/lib/privacidade";
import { Button, cn } from "@/components/ui";
import { BoasVindas, CampoAcesso, InputAcesso, InputSenha, Interruptor, Moldura, type SeccaoAjuda } from "@/components/Acesso";
import { TecladoPin, inicioDe, usePolitica, useTecladoFisicoPin } from "@/components/Sessao";
import RecuperarSenha from "@/pages/RecuperarSenha";
import PerguntasAcesso from "@/pages/PerguntasAcesso";

const OBRIGATORIO = "Este campo é obrigatório";

export default function Login({ empresa }: { empresa: string | null }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [pin, setPin] = useState("");
  const [modo, setModo] = useState<"senha" | "pin">("senha");
  const [erro, setErro] = useState("");
  // verificação em dois passos: a senha está certa e falta o código da aplicação (ou um de recuperação)
  const [pedirCodigo, setPedirCodigo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  // os avisos «Este campo é obrigatório» só aparecem depois de carregar em Entrar
  const [tocado, setTocado] = useState(false);
  const [vista, setVista] = useState<"entrar" | "recuperar" | "perguntas">("entrar");
  const [seccao, setSeccao] = useState<SeccaoAjuda | undefined>();
  const [ocultar, setOcultar] = useOcultarValores();
  const setSessao = useSession((s) => s.setSessao);
  const politica = usePolitica();
  const nav = useNavigate();
  const comPin = !!politica.data?.login_pin;
  // «Incompatibilidade de conta» (como no Claude): o aparelho tem a sessão de outra pessoa
  const [contaDiferente, setContaDiferente] = useState<{ nome: string; metodo: "auth.login" | "auth.loginPin"; params: object } | null>(null);
  const [trocar, setTrocar] = useState(false);
  // «não sou um robô» (Cloudflare Turnstile), só na entrada pela Internet num endereço do KanGest
  const chaveHumano = politica.data?.humano ?? null;
  const [humano, setHumano] = useState("");
  const [reiniciarHumano, setReiniciarHumano] = useState(0);
  // confirmado no widget: o aviso «Confirme que não é um robô» deixa de fazer sentido
  const aoToken = useCallback((t: string) => {
    setHumano(t);
    if (t) setErro((e) => (e.startsWith("Confirme que não é um robô") ? "" : e));
  }, []);
  // entrar pelo navegador (src-tauri/src/sinc/entrada.rs): com o Google, ou com a sessão que a pessoa já tem aberta no
  // site (pedido do dono a 27/11: «o login deve funcionar para os dois»). O navegador do sistema abre a página e o
  // retorno chega pela ligação kangest://auth («kangest-google»). O estado da entrada fica guardado para a volta do código.
  const [google, setGoogle] = useState<"parado" | "a_espera">("parado");
  const [via, setVia] = useState<ViaNavegador>("google");
  const [estadoGoogle, setEstadoGoogle] = useState<string | null>(null);
  const googleRef = useRef(google);
  const viaRef = useRef(via);
  useEffect(() => {
    googleRef.current = google;
    viaRef.current = via;
  }, [google, via]);

  async function concluirGoogle(params: { estado: string; code?: string; codigo?: string }) {
    setBusy(true);
    setErro("");
    try {
      const s = await call<Sessao | { dois_passos: true }>("auth.google_concluir", params);
      if ("dois_passos" in s) {
        setEstadoGoogle(params.estado);
        setPedirCodigo(true);
        setTocado(false);
        return;
      }
      setSessao(s);
      nav(inicioDe(s), { replace: true });
    } catch (err) {
      setErro((err as Error).message);
      setEstadoGoogle(null);
      setPedirCodigo(false);
      setCodigo("");
    } finally {
      setBusy(false);
      setGoogle("parado");
    }
  }

  useEffect(() => {
    if (!NA_APP) return;
    let desligar: (() => void) | undefined;
    let fechado = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ estado: string; code: string | null; erro: string | null }>("kangest-google", (ev) => {
        const r = ev.payload;
        if (googleRef.current !== "a_espera") return;
        if (r.erro || !r.code) {
          const quem = viaRef.current === "site" ? "O site" : "O Google";
          setGoogle("parado");
          setErro(r.erro ? `${quem} não deixou entrar: ${r.erro}` : `${quem} não devolveu a entrada: tente outra vez.`);
          return;
        }
        void concluirGoogle({ estado: r.estado, code: r.code });
      }).then((f) => {
        if (fechado) f();
        else desligar = f;
      }),
    );
    return () => {
      fechado = true;
      desligar?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciarGoogle(por: ViaNavegador) {
    setErro("");
    setBusy(true);
    try {
      await call(por === "site" ? "auth.site_iniciar" : "auth.google_iniciar");
      setVia(por);
      setGoogle("a_espera");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function cancelarGoogle() {
    void call("auth.google_cancelar").catch(() => {});
    setGoogle("parado");
    setEstadoGoogle(null);
  }

  async function entrar(metodo: "auth.login" | "auth.loginPin", params: object) {
    setBusy(true);
    setErro("");
    try {
      // depois de «Sair e trocar de conta», todas as voltas (incluindo a do código) levam a confirmação
      const extra = { ...(trocar ? { trocar: true } : {}), ...(chaveHumano && metodo === "auth.login" ? { humano } : {}) };
      const s = await call<Sessao | { dois_passos: true }>(metodo, { ...params, ...extra });
      if ("dois_passos" in s) {
        setPedirCodigo(true);
        setTocado(false);
        return;
      }
      setSessao(s);
      nav(inicioDe(s), { replace: true });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("Conta diferente:")) {
        setContaDiferente({ nome: msg.replace(/^Conta diferente: este aparelho tem a sessão de /, "").replace(/\.$/, ""), metodo, params });
        return;
      }
      setErro(msg);
      // cada token do widget só serve uma vez: depois de uma recusa, pede-se outro
      if (chaveHumano) setReiniciarHumano((n) => n + 1);
      setCodigo("");
      if (!pedirCodigo) setSenha("");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function submeter(e: FormEvent) {
    e.preventDefault();
    setTocado(true);
    if (pedirCodigo) {
      if (!codigo.trim()) return;
      if (estadoGoogle) void concluirGoogle({ estado: estadoGoogle, codigo });
      else entrar("auth.login", { login, senha, codigo });
      return;
    }
    if (!login.trim() || !senha) return;
    if (chaveHumano && !humano) {
      setErro("Confirme que não é um robô (a caixa da Cloudflare, por cima do botão Entrar).");
      return;
    }
    entrar("auth.login", { login, senha });
  }

  function recomecar() {
    if (estadoGoogle) cancelarGoogle();
    setPedirCodigo(false);
    setCodigo("");
    setSenha("");
    setErro("");
    setTocado(false);
  }

  const ajuda = (s?: SeccaoAjuda) => {
    setSeccao(s);
    setVista("perguntas");
  };

  useTecladoFisicoPin(vista === "entrar" && comPin && modo === "pin", pin, setPin, () => entrar("auth.loginPin", { pin }));

  if (vista === "recuperar") return <RecuperarSenha loginInicial={login} onVoltar={() => setVista("entrar")} onAjuda={ajuda} />;
  if (vista === "perguntas") return <PerguntasAcesso seccao={seccao} onVoltar={() => setVista("entrar")} onAjuda={ajuda} />;

  if (contaDiferente) {
    const c = contaDiferente;
    return (
      <Moldura empresa={empresa} onAjuda={ajuda}>
        <div className="w-full max-w-[440px] text-center">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Incompatibilidade de conta</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Este aparelho tem a sessão de <b className="text-ink">{c.nome}</b> (por exemplo, noutra aba deste browser). Para entrar com outra conta, a
            sessão de {c.nome} termina neste aparelho e as outras abas passam para a conta nova.
          </p>
          <div className="mt-7 flex justify-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setContaDiferente(null);
                setSenha("");
                setPin("");
              }}
            >
              Cancelar
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                setContaDiferente(null);
                setTrocar(true);
                void entrar(c.metodo, { ...c.params, trocar: true });
              }}
            >
              Sair e trocar de conta
            </Button>
          </div>
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura empresa={empresa} onAjuda={ajuda}>
      <div className="w-full max-w-[440px]">
        <BoasVindas texto={pedirCodigo ? undefined : modo === "pin" && comPin ? "Introduza o seu PIN de operador." : undefined} />

        {comPin && !pedirCodigo && (
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1 text-[13px]">
            {(["senha", "pin"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setModo(m);
                  setErro("");
                  setTocado(false);
                }}
                className={cn("rounded-md py-1.5", modo === m ? "bg-surface font-medium shadow-sm" : "text-ink-2")}
              >
                {m === "senha" ? "Utilizador e senha" : "PIN"}
              </button>
            ))}
          </div>
        )}

        {pedirCodigo ? (
          <form noValidate onSubmit={submeter} className="space-y-5">
            <div className="flex gap-3 rounded-lg bg-brand-50 p-3 text-[13px] text-ink-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
              <span>Verificação em dois passos: escreva o código de 6 algarismos que a aplicação de autenticação mostra agora (ou um dos códigos de recuperação).</span>
            </div>
            <CampoAcesso label="Código" erro={tocado && !codigo.trim() && OBRIGATORIO}>
              <InputAcesso
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.slice(0, 12))}
                invalido={tocado && !codigo.trim()}
                className="text-center font-mono text-[20px] tracking-[0.3em]"
                placeholder="000000"
              />
            </CampoAcesso>
            <Button variant="accent" size="lg" className="h-12 w-full text-[15px]" loading={busy}>
              Confirmar <ArrowRight className="size-4" />
            </Button>
            <button type="button" onClick={recomecar} className="w-full text-[13px] text-ink-3 hover:text-ink">
              Entrar com outro utilizador
            </button>
          </form>
        ) : modo === "pin" && comPin ? (
          <TecladoPin valor={pin} onChange={setPin} ocupado={busy} onConfirmar={() => entrar("auth.loginPin", { pin })} />
        ) : (
          <form noValidate onSubmit={submeter} className="space-y-5">
            <CampoAcesso label="Utilizador ou email da conta do site" erro={tocado && !login.trim() && OBRIGATORIO}>
              <InputAcesso
                autoFocus
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                invalido={tocado && !login.trim()}
              />
            </CampoAcesso>
            <CampoAcesso label="Senha" erro={tocado && !senha && OBRIGATORIO}>
              <InputSenha autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} invalido={tocado && !senha} />
            </CampoAcesso>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Interruptor ligado={ocultar} onChange={setOcultar} rotulo="Ocultar valores" dica="Esconde os valores em kwanzas do painel neste aparelho" />
              <button type="button" onClick={() => setVista("recuperar")} className="text-[14px] font-medium text-ink underline underline-offset-2 hover:text-brand">
                Esqueci-me da senha
              </button>
            </div>
            {chaveHumano && <VerificacaoHumano chave={chaveHumano} onToken={aoToken} reiniciar={reiniciarHumano} />}
            <Button variant="accent" size="lg" className="h-12 w-full text-[15px]" loading={busy}>
              Entrar <ArrowRight className="size-4" />
            </Button>
            <EntrarComGoogle esperar={google === "a_espera"} via={via} ocupado={busy} onIniciar={(por) => void iniciarGoogle(por)} onCancelar={cancelarGoogle} />
          </form>
        )}

        {erro && <p className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger">{erro}</p>}
        <EstadoDaLigacao />
      </div>
    </Moldura>
  );
}

type LigacaoEntrada = { ligado: boolean; loja?: string; em_linha?: boolean; versao?: string };
type ViaNavegador = "google" | "site";

/**
 * «Entrar com o Google» (KANGEST ONE, fase A) e «Entrar com a sessão do site» (pedido do dono a 27/11): só no programa
 * instalado e com o KanGest ligado ao site e em linha (sem Internet, entra-se com o email e a senha). Enquanto o
 * navegador está aberto, diz-se o que fazer e dá para desistir.
 */
function EntrarComGoogle({
  esperar,
  via,
  ocupado,
  onIniciar,
  onCancelar,
}: {
  esperar: boolean;
  via: ViaNavegador;
  ocupado: boolean;
  onIniciar: (via: ViaNavegador) => void;
  onCancelar: () => void;
}) {
  const q = useQuery({
    queryKey: ["entrada", "ligacao"],
    queryFn: async () => (await call<{ ligacao?: LigacaoEntrada }>("setup.estado")).ligacao ?? null,
    enabled: NA_APP,
    refetchInterval: 30_000,
  });
  if (!NA_APP || !q.data?.ligado || !q.data.em_linha) return null;
  if (esperar) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-sunken px-3 py-2.5 text-[13px] text-ink-2" role="status">
        <span>
          {via === "site"
            ? "Continue no navegador: confirme a entrada na página do site (se ainda não entrou lá, entre primeiro). Depois, o KanGest abre sozinho."
            : "Continue no navegador: escolha a sua conta Google. Depois, o KanGest abre sozinho."}
        </span>
        <button type="button" onClick={onCancelar} className="shrink-0 font-medium text-ink underline underline-offset-2 hover:text-brand">
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center gap-3 text-[12px] text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        ou
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button type="button" variant="secondary" size="lg" className="h-12 w-full text-[15px]" disabled={ocupado} onClick={() => onIniciar("google")}>
        <LogoGoogle /> Entrar com o Google
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="h-12 w-full text-[15px]"
        disabled={ocupado}
        onClick={() => onIniciar("site")}
        title="Se já entrou no site neste computador, o KanGest entra com essa conta, sem escrever a senha"
      >
        <Globe className="size-[18px]" aria-hidden /> Entrar com a sessão do site
      </Button>
    </>
  );
}

/** O «G» do Google, com as cores dele (as regras de marca do Google pedem o logótipo tal como é). */
function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Por baixo da entrada (KANGEST ONE): a ligação ao servidor central e a versão. Ligado e com a última volta certa:
 * «Ligado ao servidor central». Ligado mas sem resposta: a conta do site entra no modo limitado, e diz-se o que isso
 * quer dizer. Um KanGest isolado só mostra a versão. Confere-se de 30 em 30 segundos.
 */
function EstadoDaLigacao() {
  const q = useQuery({
    queryKey: ["entrada", "ligacao"],
    queryFn: async () => (await call<{ ligacao?: LigacaoEntrada }>("setup.estado")).ligacao ?? null,
    refetchInterval: 30_000,
  });
  const l = q.data;
  if (!l) return null;
  return (
    <div className="mt-6 space-y-2 text-[12.5px] text-ink-3" role="status">
      {l.ligado &&
        (l.em_linha ? (
          <p className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-ok" aria-hidden />
            Ligado ao servidor central{l.loja ? ` · ${l.loja}` : ""}
          </p>
        ) : (
          <p className="flex gap-2 rounded-lg border border-accent/40 bg-accent-50 px-3 py-2 text-accent-ink">
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Sem ligação ao servidor central. Com a conta do site entra no modo limitado: vende e factura, mas a loja online e a confirmação de
              pagamentos esperam pela Internet.
            </span>
          </p>
        ))}
      {l.versao && <p>KanGest Livraria {l.versao}</p>}
    </div>
  );
}

type Turnstile = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };

/** O widget «não sou um robô» do Cloudflare (Turnstile), carregado só quando a entrada é pela Internet. */
function VerificacaoHumano({ chave, onToken, reiniciar }: { chave: string; onToken: (t: string) => void; reiniciar: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  useEffect(() => {
    let vivo = true;
    const desenhar = () => {
      const ts = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (!vivo || !ts || !ref.current || id.current) return;
      id.current = ts.render(ref.current, {
        sitekey: chave,
        language: "pt",
        // a largura do formulário, alinhado com os campos
        size: "flexible",
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    if ((window as unknown as { turnstile?: Turnstile }).turnstile) desenhar();
    else {
      let s = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!s) {
        s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.dataset.turnstile = "1";
        document.head.appendChild(s);
      }
      s.addEventListener("load", desenhar);
    }
    return () => {
      vivo = false;
      const ts = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (id.current && ts) ts.remove(id.current);
      id.current = null;
    };
  }, [chave, onToken]);
  useEffect(() => {
    const ts = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (reiniciar && id.current && ts) {
      ts.reset(id.current);
      onToken("");
    }
  }, [reiniciar, onToken]);
  return <div ref={ref} className="min-h-[65px] w-full" />;
}
