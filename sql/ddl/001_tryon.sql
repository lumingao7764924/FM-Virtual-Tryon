-- FM Try-On BigQuery 建表。在 BigQuery 控制台「SQL 查询」里整段粘贴运行一次即可（可重复运行）。
-- 项目 feimei-virtual-tryon，数据集 tryon，区域 US。

CREATE SCHEMA IF NOT EXISTS `feimei-virtual-tryon.tryon`
OPTIONS (location = 'US', description = 'FM Try-On 扫脸选色：配置 + 账号 + 埋点');

-- 项目配置：每次保存追加一行（版本），读取时取每个 finder_id 的最大 version
CREATE TABLE IF NOT EXISTS `feimei-virtual-tryon.tryon.finder_versions` (
  finder_id STRING NOT NULL,
  version INT64 NOT NULL,
  code STRING NOT NULL,
  status STRING NOT NULL,
  title STRING,
  brand STRING,
  payload STRING NOT NULL OPTIONS (description = '完整配置 JSON（Finder）'),
  updated_at TIMESTAMP NOT NULL,
  updated_by STRING,
  created_at TIMESTAMP,
  created_by STRING
)
CLUSTER BY finder_id
OPTIONS (description = '扫脸项目配置版本（只追加）');

-- 后台白名单账号：每次修改追加一行，取每个 email 的最新一行
CREATE TABLE IF NOT EXISTS `feimei-virtual-tryon.tryon.admin_users` (
  email STRING NOT NULL,
  name STRING,
  role STRING NOT NULL,
  status STRING NOT NULL,
  deleted BOOL,
  scope STRING OPTIONS (description = 'all 全部项目，own 仅自己创建的'),
  brands STRING OPTIONS (description = 'JSON 品牌数组，空数组表示全部品牌'),
  created_at TIMESTAMP,
  created_by STRING,
  updated_at TIMESTAMP NOT NULL,
  updated_by STRING
)
OPTIONS (description = '后台账号白名单（只追加）');

ALTER TABLE `feimei-virtual-tryon.tryon.admin_users` ADD COLUMN IF NOT EXISTS scope STRING;
ALTER TABLE `feimei-virtual-tryon.tryon.admin_users` ADD COLUMN IF NOT EXISTS brands STRING;

-- 扫码页埋点：按天分区，按项目 + 事件聚簇
CREATE TABLE IF NOT EXISTS `feimei-virtual-tryon.tryon.events` (
  event_id STRING NOT NULL,
  event_name STRING NOT NULL,
  event_date DATE NOT NULL OPTIONS (description = '服务器接收日期（UTC）'),
  finder_id STRING NOT NULL,
  finder_code STRING,
  finder_version INT64,
  visitor_id STRING,
  session_id STRING,
  channel STRING,
  variant_id STRING,
  sku STRING,
  role STRING,
  button_id STRING,
  url STRING,
  undertone STRING,
  feedback STRING,
  recommended STRING OPTIONS (description = 'JSON: [{variantId, sku, role}]'),
  skin_l FLOAT64,
  skin_a FLOAT64,
  skin_b FLOAT64,
  duration_ms INT64,
  device STRING,
  os STRING,
  user_agent STRING,
  client_ts TIMESTAMP,
  received_at TIMESTAMP NOT NULL
)
PARTITION BY event_date
CLUSTER BY finder_id, event_name
OPTIONS (description = '扫码页埋点（替代 GA4）');
