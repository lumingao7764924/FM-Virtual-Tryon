# Cloud Build 自动部署（push → 上线）

和 VOC 同一套：仓库里放 Cloud Build 配置，GitHub 的 `main` 一推，GCP 构建镜像并更新 Cloud Run。不是 GitHub Actions。

三个服务，都在项目 `feimei-virtual-tryon`、区域 `us-central1`：

| 配置文件 | Cloud Run 服务 | 谁在用 |
| --- | --- | --- |
| `cloudbuild.api.yaml` | `tryon-api` | 登录、配置、埋点、统计 |
| `cloudbuild.web.yaml` | `tryon-web` | 后台 |
| `cloudbuild.scan.yaml` | `tryon-scan` | 顾客扫码打开的页面（Cloud Run 自带 HTTPS，手机摄像头可用） |

后台和扫码页都是静态页面，由 nginx 把 `/api` 转到 `tryon-api`。浏览器只访问自己的域名，登录 cookie 不会跨站。

自动部署**只换镜像**。环境变量、密钥、运行时服务账号在第一次手工部署时写上，以后推代码不会被清掉。

GitHub 仓库：`https://github.com/lumingao7764924/FM-Virtual-Tryon`

---

## 一、授权（只需一次）

打开项目 `feimei-virtual-tryon`，右上角项目信息里复制**项目编号**。OAuth 客户端 ID 开头的 `372608906672` 通常就是它，以控制台显示的为准。

Cloud Build 默认账号：

`项目编号@cloudbuild.gserviceaccount.com`

用项目里的 Cloud Shell 执行（把编号换成你的）：

```bash
PROJECT=feimei-virtual-tryon
PROJECT_NUMBER=372608906672
CB_SA=${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com
RUNTIME_SA=tryon-api@${PROJECT}.iam.gserviceaccount.com

gcloud config set project $PROJECT

gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser"

gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser"
```

`tryon-api` 这个服务账号要已经有「BigQuery 数据编辑者」和「BigQuery 作业用户」。线上不再上传 `keys/tryon-api.json`，Cloud Run 用这个账号自己访问 BigQuery。

---

## 二、镜像仓库和登录密钥（只需一次）

仍在 Cloud Shell：

```bash
gcloud artifacts repositories create tryon \
  --repository-format=docker \
  --location=us-central1 \
  --description="FM Try-On images"

openssl rand -base64 48 | gcloud secrets create tryon-jwt --data-file=-

gcloud secrets add-iam-policy-binding tryon-jwt \
  --member="serviceAccount:tryon-api@feimei-virtual-tryon.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

`openssl` 那一行会生成登录用的 JWT 密钥并直接存进 Secret Manager。不要把输出贴到聊天或写进代码。

仓库已存在时，`create` 会报错，跳过即可。

---

## 三、第一次手工部署

代码必须已经在 GitHub 的 `main` 上（含这三份 yaml 和 Dockerfile）。Cloud Shell：

```bash
cd ~
git clone https://github.com/lumingao7764924/FM-Virtual-Tryon.git
cd FM-Virtual-Tryon
```

自动部署的 yaml 只负责换镜像。第一次要把环境变量、密钥、运行账号一起写上，所以先构建镜像，再单独创建服务。

### 1. API

后台和扫码页的地址还没有，来源和二维码先写占位，下一步再改成真实地址。

```bash
gcloud builds submit --config cloudbuild.api.yaml .

gcloud run deploy tryon-api \
  --region us-central1 \
  --allow-unauthenticated \
  --service-account tryon-api@feimei-virtual-tryon.iam.gserviceaccount.com \
  --set-secrets JWT_SECRET=tryon-jwt:latest \
  --set-env-vars ^|^NODE_ENV=production|STORAGE=bigquery|GCP_PROJECT_ID=feimei-virtual-tryon|BQ_DATASET=tryon|COOKIE_SECURE=true|GOOGLE_CLIENT_ID=372608906672-jdqd67r8jpikq9grdr7229o3p5mc17pv.apps.googleusercontent.com|ADMIN_EMAILS=milolu1996@gmail.com|CORS_ORIGIN=https://placeholder.invalid|PUBLIC_SCAN_BASE_URL=https://placeholder.invalid \
  --image us-central1-docker.pkg.dev/feimei-virtual-tryon/tryon/tryon-api:latest
```

`--set-env-vars` 用 `|` 当分隔符，避免逗号把邮箱和网址截断。

第一次 `builds submit` 里的部署步骤可能失败，因为服务还没有这些环境变量。只要镜像推上去了，第二条 `run deploy` 会把服务建起来。

记下 API 地址，形如 `https://tryon-api-xxxxx.us-central1.run.app`。

### 2. 后台和扫码页

把下面的 `API_URL` 换成上一步的地址。

```bash
API_URL=https://tryon-api-xxxxx.us-central1.run.app

gcloud builds submit --config cloudbuild.web.yaml .
gcloud run deploy tryon-web \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars API_UPSTREAM=$API_URL \
  --image us-central1-docker.pkg.dev/feimei-virtual-tryon/tryon/tryon-web:latest

gcloud builds submit --config cloudbuild.scan.yaml .
gcloud run deploy tryon-scan \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars API_UPSTREAM=$API_URL \
  --image us-central1-docker.pkg.dev/feimei-virtual-tryon/tryon/tryon-scan:latest
```

记下两个地址：`tryon-web-….run.app` 和 `tryon-scan-….run.app`。

### 3. 把真实地址写回 API

二维码会指向扫码页；登录只接受这两个网站的来源。

```bash
WEB_URL=https://tryon-web-xxxxx.us-central1.run.app
SCAN_URL=https://tryon-scan-xxxxx.us-central1.run.app

gcloud run services update tryon-api \
  --region us-central1 \
  --update-env-vars ^|^CORS_ORIGIN=${WEB_URL},${SCAN_URL}|PUBLIC_SCAN_BASE_URL=${SCAN_URL}
```

### 4. Google 登录允许这个后台

[Google Auth Platform → 客户端](https://console.cloud.google.com/auth/clients?project=feimei-virtual-tryon) 打开现有的 Web 客户端，**已获授权的 JavaScript 来源**加上 `WEB_URL`（没有路径，没有末尾斜杠）。应用保持「测试」，测试用户里要有你的 Gmail。

---

## 四、连接 GitHub，以后自动部署（只需一次）

1. 打开 [Cloud Build 触发器](https://console.cloud.google.com/cloud-build/triggers?project=feimei-virtual-tryon)
2. **连接代码库** → **GitHub（Cloud Build GitHub App）** → 授权，选中 `lumingao7764924/FM-Virtual-Tryon`
3. 建三个触发器，事件都是「推送到分支」，分支 `^main$`，配置选「仓库中的 Cloud Build 配置文件」：

| 名称 | 配置文件 | 包含的文件过滤 |
| --- | --- | --- |
| `deploy-tryon-api` | `cloudbuild.api.yaml` | `apps/api/**` , `packages/shared/**` , `cloudbuild.api.yaml` |
| `deploy-tryon-web` | `cloudbuild.web.yaml` | `apps/web/**` , `packages/shared/**` , `cloudbuild.web.yaml` |
| `deploy-tryon-scan` | `cloudbuild.scan.yaml` | `apps/scan/**` , `packages/shared/**` , `cloudbuild.scan.yaml` |

文件过滤在界面里通常一行一个。改了 `packages/shared` 时三个都会跑，这是对的。

---

## 五、以后发版

```bash
git add .
git commit -m "说明这次改动"
git push origin main
```

到 Cloud Build → 历史记录看绿勾。几分钟后打开后台地址登录。

- 只改 API → 一般只跑 `deploy-tryon-api`
- 只改后台 → `deploy-tryon-web`
- 只改扫码页 → `deploy-tryon-scan`
- 改了匹配算法（`packages/shared`）→ 三个都会跑

顾客二维码的域名是扫码页的地址。印出去之前，如果以后要换成自己的域名，要同时改 API 的 `PUBLIC_SCAN_BASE_URL`，旧的 `run.app` 链接才会被新域名替换。在那之前，已经下载的二维码指向现在的 `tryon-scan` 地址。
