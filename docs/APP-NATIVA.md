# BLINK como app nativa (Android e iPhone)

A BLINK passa a ter duas saídas a partir do mesmo código:

| Saída | Como é gerada | Onde corre |
|---|---|---|
| **Site** (igual a hoje) | `npm run build` → TanStack Start + Nitro no Vercel | https://blink-acme-7742.vercel.app |
| **App nativa** | `npm run build:native` → pasta `www/` embrulhada pelo **Capacitor 8** | Android (`android/`) e iOS (`ios/`) |

## Porque é que a app leva os ficheiros dentro (e não abre o site)

- O estúdio é 100 % do lado do cliente: copos 3D em WebGL2 (`src/lib/cup-gl.ts`, com recurso 2D), arte lida no próprio telemóvel, rascunho em `localStorage`, PDF montado no browser (`canvasPdf` em `src/lib/print.ts`). A rota `/` não chama nenhuma API do servidor.
- O servidor (SSR, Better Auth, base de dados) só serve a página e a instalação PWA; o estúdio não precisa dele.
- O site no Vercel está protegido por SSO: uma app que abrisse o URL ficava presa no ecrã de login da Vercel.
- Com os ficheiros dentro da app: funciona sem rede (só as fontes Google precisam de internet na primeira abertura; sem rede usa a letra de recurso), abre mais depressa e não há CORS nem URLs absolutos a configurar.
- Se um dia o estúdio passar a chamar APIs do servidor (encomendas, contas), essas chamadas terão de usar o URL absoluto de produção e o servidor terá de aceitar as origens `capacitor://localhost` (iOS) e `https://localhost` (Android) no CORS. Hoje não há nenhuma.

## O que muda só na app (o site fica igual)

| Função | Site | App nativa |
|---|---|---|
| Logo / Padrão | escolher ficheiro do browser | folha do sistema: **Tirar foto**, **Galeria**, **Ficheiros (PDF, SVG…)** — os mesmos botões, sem botões novos |
| Descarregar PDF | descarga do browser | guarda em `Documentos/BLINK/` (iOS: app Ficheiros › No meu iPhone › BLINK) e abre a folha de **Partilhar** (WhatsApp, email, Drive, Guardar em Ficheiros) |
| Botão voltar (Android) | — | fecha a janela aberta (zoom, Pantone, ficha, cor); sem janela aberta, sai da app |
| Margens (notch, barra de gestos) | `env(safe-area-inset-*)` | o mesmo + variáveis do Capacitor 8 em Android |
| Ícone e splash | `public/manifest.webmanifest`, `public/icon-*.png` | gerados a partir de `assets/` (logo do copo BLINK) |

Ficheiros principais:

- `capacitor.config.ts` — appId `com.orlogarrulo.blink`, nome **BLINK**, `webDir: www`.
- `vite.native.config.ts` + `native/` — entrada da app (mesmo `<BlinkApp />`), ponte nativa (`native/bridge.ts`) e CSS das margens.
- `src/lib/native-bridge.ts` — ponto de ligação seguro para a web: no site não existe e tudo se comporta como antes. O site nunca carrega o Capacitor.
- `android/`, `ios/` — projetos nativos gerados pelo Capacitor (podem ser abertos no Android Studio / Xcode).
- `assets/` — origem dos ícones e splash (`npm run cap:assets` regenera tudo).

Nenhuma chave secreta entra na app nem no `capacitor.config.ts`.

## Preparar o computador

- Node 22+ e `npm ci`.
- **Android**: Android Studio (ou só o SDK) com Android SDK 36 e **JDK 21**. Defina `ANDROID_HOME` (ou crie `android/local.properties` com `sdk.dir=...`).
- **iOS**: um **Mac** com Xcode 26 ou mais recente. Não é preciso CocoaPods: o projeto usa Swift Package Manager.

## Gerar a app Android

```bash
npm ci
npm run android:apk          # build:native + cap sync + gradlew assembleDebug
# APK de teste: android/app/build/outputs/apk/debug/app-debug.apk
```

Instalar num telemóvel ligado por USB (com "Depuração USB" ligada): `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

### AAB assinado para a Play Store

1. Criar a chave de assinatura (uma só vez; **guardar o ficheiro e as palavras-passe num sítio privado — se se perder, não é possível atualizar a app**):
   ```bash
   keytool -genkey -v -keystore blink-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias blink
   ```
2. Criar `android/keystore.properties` (já está no `.gitignore`, tal como `*.jks`; **nunca** fazer commit destes ficheiros):
   ```
   storeFile=/caminho/privado/blink-upload.jks
   storePassword=...
   keyAlias=blink
   keyPassword=...
   ```
3. O `android/app/build.gradle` já lê esse ficheiro e assina o *release* automaticamente quando ele existe (em alternativa, *Build › Generate Signed App Bundle* no Android Studio).
4. Subir `versionCode` (número inteiro, +1 em cada envio) e `versionName` em `android/app/build.gradle`.
5. `npm run android:aab` → `android/app/build/outputs/bundle/release/app-release.aab`.

## Gerar a app iPhone (só num Mac)

```bash
npm ci
npm run ios:open             # build:native + cap sync + abre o Xcode
```

No Xcode: *Signing & Capabilities* → escolher a equipa (Team) da conta Apple Developer → *Product › Archive* → *Distribute App* → *App Store Connect* (gera e envia o IPA). Para testes, *TestFlight*.

As mensagens de permissão (câmara, galeria) já estão em `ios/App/App/Info.plist`, em português.

## Publicar

### Google Play

- Conta **Google Play Console**: taxa única de **25 USD** (cartão de crédito/débito em nome do titular; não aceita pré-pagos). Pede verificação de identidade (documento oficial).
- Conta pessoal criada depois de novembro de 2023: antes de publicar em produção, é obrigatório um **teste fechado com pelo menos 12 testadores durante 14 dias seguidos**. Conta de organização (empresa, com número D-U-N-S) não tem este requisito.
- Na consola: criar a app, ficha da loja (nome, descrição curta e longa, ícone 512×512, gráfico de destaque 1024×500, pelo menos 2 capturas de ecrã de telemóvel), classificação de conteúdo, público-alvo, **política de privacidade** (URL público), formulário de *Segurança dos dados*, e enviar o `.aab` para um *track* (teste interno → fechado → produção).
- Usar a assinatura de apps do Google Play (recomendado): a chave acima passa a ser só a "chave de carregamento".

### App Store

- **Apple Developer Program**: **99 USD por ano** (preço em moeda local quando existe). Como particular inscreve-se de imediato; como empresa precisa de número D-U-N-S e a Apple valida a entidade.
- Precisa de um **Mac com Xcode** (próprio, emprestado ou um serviço de Mac na nuvem / CI, ex.: Codemagic, GitHub Actions macOS, Ionic Appflow).
- No **App Store Connect**: criar a app com o Bundle ID `com.orlogarrulo.blink`, ficha (nome, subtítulo, descrição, palavras-chave, capturas 6,9" e 6,5", ícone 1024×1024 já gerado), **política de privacidade**, *App Privacy* (a app não recolhe dados), classificação etária, e enviar o build para revisão.
- Atenção à regra 4.2 da Apple (funcionalidade mínima): uma app que é "só um site" pode ser recusada. A BLINK corre localmente, usa câmara, galeria, ficheiros e partilha nativa, o que ajuda; convém explicar isso nas notas para a revisão.

## O que só o Orlog pode fazer

1. Criar e pagar as contas (Google Play Console 25 USD uma vez; Apple Developer 99 USD/ano) e passar a verificação de identidade.
2. Criar e guardar a chave de assinatura Android (`.jks`) e as palavras-passe, e o certificado/perfil da Apple (feito no Xcode com a conta dele).
3. Aprovar o nome final na loja, os textos, as capturas e publicar a política de privacidade.
4. Arranjar acesso a um Mac (ou a um serviço de build macOS) para gerar o IPA.
5. Recrutar os 12 testadores do teste fechado da Play Store (se a conta for pessoal).
6. Carregar em *Publicar* / *Submeter para revisão*.

## Atualizar a app depois de mudanças no site

Sempre que o estúdio mudar: `npm run cap:sync` (reconstrói `www/` e copia para Android/iOS), subir a versão e gerar novo AAB/IPA. Os ícones só precisam de `npm run cap:assets` se o logo mudar.
