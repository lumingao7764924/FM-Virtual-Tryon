# FM Try-On — 扫脸推荐色号（独立版）

给 TikTok / Amazon 等 Shopify 以外渠道用的扫脸试色：每个产品一个二维码，扫码即开相机推荐色号，点击按钮跳转到各平台商品页。逻辑与 Shopify 主题扩展 `fm-makeup-pdp` 一致。

## 目录

```
fm-try-on/
├── apps/api        # Fastify：Google 登录、后台 CRUD、公开配置、埋点接收、统计
├── apps/web        # React + shadcn：后台管理（项目列表 / 编辑 / 数据 / 账号）
├── apps/scan       # 消费者扫码 H5 / 移动端采集器
├── packages/shared # 色号匹配核心、人脸检测门、配置校验、埋点与统计契约
└── sql/ddl         # BigQuery 建表（待建）
```

存储：全部 BigQuery（配置按版本追加写；埋点按天分区）。本期不用 GCS，icon 暂不开放。
未接 BigQuery 前用 `STORAGE=local`，数据写在 `apps/api/.data/*.jsonl`（已 gitignore，删掉即重置；空库启动会自动建一个 `demo` 项目）。

## 本地

```bash
npm install
npm run build:shared
npm test            # shared 单测 + 与 Shopify 原版的随机对拍 + API 接口测试
cp .env.example apps/api/.env   # 至少填 ADMIN_EMAILS
```

三个服务各开一个终端：

| 命令 | 地址 | 说明 |
| --- | --- | --- |
| `npm run dev:api` | http://localhost:8788 | 后端（避开 VOC 的 8787） |
| `npm run dev:web` | http://localhost:5180 | 后台（避开 VOC 的 5173） |
| `npm run dev:scan` | https://localhost:5174/s/demo | 扫码页 |

### 接 BigQuery

1. BigQuery 控制台「SQL 查询」整段运行 `sql/ddl/001_tryon.sql`（建数据集 `tryon` + 3 张表，可重复运行）。
2. IAM → 服务账号：建 `tryon-api`，角色「BigQuery 数据编辑者」+「BigQuery 作业用户」；添加 JSON 密钥，放到 `keys/tryon-api.json`（已 gitignore）。
3. `apps/api/.env`：`STORAGE=bigquery`，`GOOGLE_APPLICATION_CREDENTIALS=/绝对路径/fm-try-on/keys/tryon-api.json`，重启 API。

配置和账号表很小，API 内存缓存 30 秒；埋点按天分区，统计只扫所选日期范围。

### 后台登录

- 只有白名单邮箱能登录：`ADMIN_EMAILS`（固定管理员）+ 后台「账号管理」里添加的账号。角色：管理员 / 编辑 / 只读。
- 配置了 `GOOGLE_CLIENT_ID` 后显示 Google 登录按钮（个人 Gmail 也可以）。
- 本地 `DEV_LOGIN=true` 时登录页多一个「开发登录」，输入白名单邮箱即可，不走 Google；`NODE_ENV=production` 下强制关闭。

### 二维码链接

二维码内容 = `PUBLIC_SCAN_BASE_URL/s/链接编码`，可在下载时加渠道参数 `?ch=amazon`。
手机扫本地码测试时，把 `PUBLIC_SCAN_BASE_URL` 改成电脑局域网地址（如 `https://192.168.x.x:5174`）再重启 API。
项目启用过一次后链接编码锁定，保证已印刷的码一直有效；停用后扫码提示不可用，重新启用即恢复。

### 扫码页（apps/scan）

- 手机实测：手机和电脑连同一个 Wi-Fi，打开终端里 `Network:` 那行地址 + `/s/demo`，例如 `https://192.168.x.x:5174/s/demo`（摄像头必须 HTTPS）。
- 电脑只看界面：`SCAN_HTTP=1 npm run dev:scan` 用 HTTP 打开。
- 无摄像头调试：开发模式下浏览器控制台执行 `fmDebug.capture(214, 172, 140)`，跳过拍摄直接进入冷暖选择 / 推荐结果。
- 链接参数 `?ch=amazon` 会作为渠道写进所有埋点。
- 单位：按 750 设计稿，`设计稿 px ÷ 100 = rem`（`index.html` 把 html 字号设为 `屏宽 / 7.5`，手机最大按 540 宽算，桌面固定 375 基准）。1px 细边框保留 px。
  所有样式文件（`src/fm-makeup-pdp.css`、`src/page.css`）都直接写 rem，没有构建期换算。
- API 未启动时 `/s/demo` 使用 `apps/scan/src/mock.ts` 的演示配置；埋点会在控制台打印 `[track]`。

### 数据口径

- 访客 = 浏览器 localStorage 里的随机 ID；会话 = 一次打开页面（sessionStorage）。漏斗按会话去重。
- 深浅反馈记在当次「最佳匹配」色号上；日期按 UTC。
- 不上传任何照片，只记录肤色 Lab 数值。

### 正式环境

和 VOC 一样用 Cloud Build：推到 GitHub `main` 后自动更新 Cloud Run。三个服务是后台 `tryon-web`、扫码页 `tryon-scan`、接口 `tryon-api`。步骤见 [docs/deploy-cloud-build.md](docs/deploy-cloud-build.md)。

### 对拍

`packages/shared/test/fixtures/fm-makeup-routine.shopify.js` 是 Shopify 原版快照，对拍测试用它保证推荐结果一致；Shopify 侧算法改动后需要同步更新这份快照并重跑测试。
