import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLE_ID, assetLinksAndroid, associacaoApple, impressoesAndroid, teamIdValido } from './ligacoes-app.mjs';

const CAPACITOR = JSON.parse(readFileSync(resolve(__dirname, '../app/mobile/capacitor.config.json'), 'utf8'));
const XCODE = readFileSync(resolve(__dirname, '../app/mobile/ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
const ENTITLEMENTS = readFileSync(resolve(__dirname, '../app/mobile/ios/App/App/App.entitlements'), 'utf8');
const HEADERS = readFileSync(resolve(__dirname, '../app/web/public/_headers'), 'utf8');

describe('apple-app-site-association (iPhone)', () => {
  it('liga as páginas e as palavras-passe ao app', () => {
    const a = associacaoApple('ABCDE12345');
    expect(a.applinks.details[0].appIDs).toEqual([`ABCDE12345.${BUNDLE_ID}`]);
    expect(a.webcredentials.apps).toEqual([`ABCDE12345.${BUNDLE_ID}`]);
    // A última regra apanha todas as páginas; as anteriores tiram os ficheiros soltos.
    const regras = a.applinks.details[0].components;
    expect(regras.at(-1)).toEqual({ '/': '/*' });
    expect(regras.slice(0, -1).every((r) => r.exclude === true)).toBe(true);
  });

  it('recusa um Team ID que não é da Apple', () => {
    for (const mau of ['', 'abcde12345', 'ABCDE1234', 'ABCDE123456', 'ABCDE-1234', null]) {
      expect(teamIdValido(mau)).toBe(false);
      expect(associacaoApple(mau)).toBeNull();
    }
    expect(teamIdValido(' ABCDE12345 ')).toBe(true);
  });

  it('o bundle ID é o mesmo do Capacitor e do projecto Xcode', () => {
    expect(CAPACITOR.appId).toBe(BUNDLE_ID);
    expect(XCODE).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID};`);
  });

  it('o app aceita as ligações e as palavras-passe do site', () => {
    for (const host of ['livrariaadventista.ao', 'www.livrariaadventista.ao']) {
      expect(ENTITLEMENTS).toContain(`applinks:${host}`);
      expect(ENTITLEMENTS).toContain(`webcredentials:${host}`);
    }
  });

  it('o Pages serve o ficheiro como JSON', () => {
    expect(HEADERS).toMatch(/\/\.well-known\/apple-app-site-association\n\s+Content-Type: application\/json/);
  });
});

const MANIFESTO = readFileSync(resolve(__dirname, '../app/mobile/android/app/src/main/AndroidManifest.xml'), 'utf8');
const GRADLE = readFileSync(resolve(__dirname, '../app/mobile/android/app/build.gradle'), 'utf8');
const SHA = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');

describe('assetlinks.json (Android)', () => {
  it('liga as páginas e as palavras-passe ao pacote do app, com os certificados', () => {
    const [ligacao] = assetLinksAndroid(`${SHA.toLowerCase()}, ${SHA}`);
    expect(ligacao.relation).toEqual(['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds']);
    expect(ligacao.target).toEqual({ namespace: 'android_app', package_name: BUNDLE_ID, sha256_cert_fingerprints: [SHA] });
  });

  it('recusa impressões mal escritas', () => {
    for (const mau of ['', 'abc', SHA.slice(0, -3), SHA.replace(/:/g, ''), `${SHA},xyz`]) {
      expect(impressoesAndroid(mau)).toBeNull();
      expect(assetLinksAndroid(mau)).toBeNull();
    }
  });

  it('o pacote do Android é o mesmo do Capacitor, e o app pede a verificação das ligações', () => {
    expect(GRADLE).toContain(`applicationId "${BUNDLE_ID}"`);
    expect(MANIFESTO).toMatch(/<intent-filter android:autoVerify="true">[\s\S]*?android:host="livrariaadventista\.ao"/);
    expect(MANIFESTO).toContain('android:host="www.livrariaadventista.ao"');
  });

  it('o regresso do login abre o app', () => {
    expect(MANIFESTO).toMatch(/android:scheme="@string\/custom_url_scheme" android:host="auth"/);
  });
});
