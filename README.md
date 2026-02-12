# 開発

## 開発環境構築

## ステージング環境構築

### インフラ （CDK）

1. アプリケーションビルド (要改善：ビルドなしでインフラ構築)

    ```
    yarn build
    ```

1. ブートストラップ

    ```
    cd cdk
    cdk --profile sai --context env=stg bootstrap aws://440744255687/us-east-1
    cdk --profile sai --context env=stg bootstrap aws://440744255687/ap-northeast-1
    ```

1. チェック＆デプロイ

    ```
    cd cdk
    cdk --profile sai --context env=stg diff --all
    cdk --profile sai --context env=stg deploy --all
    ```

### APIプロキシ （Ansible）


# 運用

## 本番環境構築

### インフラ （CDK）

1. アプリケーションビルド (要改善：ビルドなしでインフラ構築)

    ```
    yarn build
    ```

1. ブートストラップ

    ```
    cdk --profile sbg --context env=prd bootstrap aws://135808917875/us-east-1
    cdk --profile sbg --context env=prd bootstrap aws://135808917875/ap-northeast-1
    ```

1. チェック＆デプロイ

    ```
    cdk --profile sbg --context env=prd diff --all
    cdk --profile sbg --context env=prd deploy --all
    ```

### APIプロキシ （Ansible）


---

# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
