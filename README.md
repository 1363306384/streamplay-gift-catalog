# Streamplay Gift Catalog

Streamplay 自己维护的 TikTok 礼物参考目录。目录按礼物 ID 合并和版本化，不包含直播业务记录、账号或密钥。

## 当前范围

- `catalog/all.json`：跨地区礼物参考库。不是某个直播间当前可以送出的礼物清单。
- `manifest.json`：目录版本、内容更新时间、总数、SHA-256 和已发布地区。
- `catalog/regions/`：地区目录预留结构；初始版本没有虚构地区数据。
- `images/` 保存实际图片文件，以内容 SHA-256 命名；相同内容只保存一份。目录的 `image` 和 `giftImageUrl` 指向本仓库的 GitHub Raw 地址。
- `catalog/image-index.json` 保存上游地址到本地图片的映射、大小和校验值，供后续同步增量复用。
- 当前只提供手动同步工具；**尚未启用定时任务、部署站点或修改 Studio 接口**。

JSON 使用 Studio 的 `giftId`、`name`、`points`、`priceKnown`、`image`、`giftImageUrl` 字段。未知价格为 `points: null, priceKnown: false`，不能当免费礼物计价。`active: null` 表示来源未提供明确状态，不能当作已下架。

## 手动同步

需要 Node.js 22 或更高版本，无第三方依赖。

```sh
npm test
npm run validate
# 镜像现有目录的图片，无需供应商 Key：
npm run images:mirror
# 通过 shell 环境或 CI Secrets 提供 TIKTOOLS_API_KEY，再运行：
npm run sync
```

脚本不会读取 `.env` 文件。不要在命令文本、日志或仓库中粘贴真实 Key。初次迁移可执行 `npm run sync -- --bootstrap-legacy`，仅在尚无本地目录时读取原 `updates.devkit.sh` JSON；之后更新只使用 TikTools 和自己的现有目录。

同步会拒绝样例、空数据、错误响应和超过 20% 的上游数量下降。按 ID 去重，同名不同 ID 保留。上游不再返回的 ID 仍保留供历史记录和已有绑定识别；不会仅凭一次缺失就删除或标记下架。合法零价保留；缺失价格不会覆盖已有价格。同步会先镜像新增图片，所有图片就绪后才更新目录，避免将地址改成尚不存在的文件。图片下载检查 HTTP 状态、内容类型、文件签名及大小；失败可重新运行，复用 `.cache/` 中的进度。内容相同不重写版本，检查时间只输出到任务日志。

## 发布与读取约定

后续可以通过 GitHub Pages 或自有域名发布本仓库的静态文件。消费者先读 `manifest.json`，再读其中的目录路径，校验 SHA-256；若不匹配则重试并保留本地上一版，不能清空目录。Git 提交提供历史回退依据。

建议后续定时同步全量库每 6 小时、实际使用地区每小时一次，凭据使用 GitHub Secrets。定时工作流单独接入，失败不发布，成功且内容变化时才提交。

## Studio 后续接入边界

1. 全量库用于收到礼物后的 ID 识别、资料补齐；不能用目录是否存在决定丢弃事件。
2. 选择框单独使用当前地区的 ID 集合过滤，并提供“本场收到”和“全部礼物”入口；地区未知要明确提示。
3. 已绑定礼物不因地区或目录变化消失。
4. 分配列表和导出基于真实收礼记录；未知价格应保留待补状态，后续补价不重复计数。
5. `all.json` 中存在某个 ID，不证明该礼物当前在某个地区、直播间或观众账号上可用。

## 来源与权属

全量数据通过 TikTools 的 `/webcast/gift_info` 获取；初始迁移保留原静态目录独有的条目。具体数量以 `manifest.json` 为准。

礼物名称、图片及其他 TikTok 资源的权利属于相应权利人。本项目不是 TikTok 官方目录，也不对第三方礼物素材授予使用许可。
