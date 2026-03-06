---
name: aws-sso-setup
description: Guia passo a passo para configurar o AWS SSO com o perfil rumo-sso em uma nova máquina.
---

# AWS SSO Setup Skill

Este guia descreve como configurar o acesso via SSO (Single Sign-On) da Rumo para que as consultas ao Athena funcionem corretamente.

## Pré-requisitos
- AWS CLI instalado ([Guia de Instalação](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))

## Configuração do Perfil (Única Vez)

Para configurar o perfil `rumo-sso` exigido pelo projeto:

   ```bash
   aws configure sso --profile rumo-sso
   ```

2. Insira as informações solicitadas:
   - **SSO session name**: `rumo-sso`
   - **SSO start URL**: `https://d-94670c90c8.awsapps.com/start/#`
   - **SSO Region**: `sa-east-1`

3. O navegador será aberto para você做 o login com suas credenciais corporativas.
4. Após o login, escolha a conta AWS e a role (`PermissionSet`) correta.
5. Quando perguntado sobre o `CLI default client Region`, use `sa-east-1`.
6. Quando perguntado sobre o `CLI default output format`, use `json`.

## Como usar no dia a dia

O token de acesso expira periodicamente. Quando você vir o erro `AWS_SSO_EXPIRED` ou `ExpiredToken`, execute:

```bash
aws sso login --profile rumo-sso
```

## Verificação
Para testar se o acesso está ativo, tente listar os arquivos no bucket S3 de logs do Athena (requer permissão):
```bash
aws s3 ls s3://rumo-athena-results-bucket/ --profile rumo-sso
```

> [!IMPORTANT]
> O nome do perfil **deve** ser exatamente `rumo-sso`, pois ele está configurado de forma estática no arquivo `src/lib/athena.ts`.
