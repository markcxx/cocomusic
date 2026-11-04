# 酷狗概念版接入调研

调研日期：2026-11-04。基于开源项目文档与源码比对，未使用真实账号登录、领取会员或验证付费歌曲。接口存在不代表当前账号可领取成功。

## 结论

可以进行接入，建议以独立的“酷狗概念版”来源提供，共享现有酷狗映射与组件，独立保存登录会话和播放来源。不能仅新增一个签到按钮，也不能仅修改现有客户端的 APPID。

最有价值的参考是 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)。其 README 明确提供 `platform=lite` 模式，并注明不同版本平台的 token 不通用。[原文](https://github.com/MakcRe/KuGouMusicApi#使用接口为概念版)

[develop202/kgcheckin](https://github.com/develop202/kgcheckin) 可作为签到流程参考。其文档声称每日可领取两天，但同页注明活动可能不面向新用户；脚本沿用旧广告领取路径，不能把其说明作为所有账号均有效的保证。

## 与当前项目的差异

| 项目 | 当前 CoCo Music | 概念版参考实现 |
| --- | --- | --- |
| 应用身份 | APPID=1005 | liteAppid=3116 |
| 版本配置 | CLIENTVER=12569 | liteClientver=11440；部分接口另有单独版本号 |
| 签名 | 普通版 Android salt 与 stream key | Android salt、stream key 均区分 lite |
| 扫码登录 | 普通版 APPID 与会话 | 扫码文本和状态查询需带概念版身份 |
| 会话 | `sessions.kugou` | 需要独立槽位，不能覆盖普通版 token |
| 播放 | `/v5/url`、pid=2、普通版页面参数 | lite pid=411，页面参数不同，另有 Auth 授权链路 |
| 歌单账户服务 | 当前普通版协议 | 上游还区分 cloudlist 的密钥和 RSA 配置 |
| 会员展示 | 通用 vipType | 概念版、畅听、超级会员及歌曲音质权限需要分别识别 |

来源：[配置](https://github.com/MakcRe/KuGouMusicApi/blob/main/util/config.json)、[签名](https://github.com/MakcRe/KuGouMusicApi/blob/main/util/helper.js)、[请求与云歌单配置](https://github.com/MakcRe/KuGouMusicApi/blob/main/util/request.js)、[扫码查询](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/login_qr_check.js)、[播放](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/song_url.js)。这些数值是调研时上游代码，不是长期固定协议。

## 会员与领取接口

下表的左侧为开源 API 的路由名，并非全部都是酷狗服务器的原始 URL。

| 开源路由 | 用途 | 接入判断 |
| --- | --- | --- |
| `/youth/union/vip` | 查询概念版权益 | 适合先做，只读；源码指定 `busi_type=concept` |
| `/youth/month/vip/record` | 查询月度领取记录 | 适合用于已领取状态和防重复 |
| `/youth/day/vip` | 按日期领取一天 | 文档标为测试接口；仅按当天正常资格验证 |
| `/youth/day/vip/upgrade` | 领取后升级畅听权益 | 不应预设每个账号都支持，需要结果确认 |
| `/youth/listen/song` | 听歌活动上报/领奖 | 应与真实播放和活动条件关联 |
| `/youth/vip` | 旧广告领取流程 | 上游文档已标记目前不可用，不宜作为核心路径 |

来源：[接口文档](https://github.com/MakcRe/KuGouMusicApi/blob/main/docs/README.md)、[权益查询源码](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/youth_union_vip.js)、[月记录](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/youth_month_vip_record.js)、[按日领取](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/youth_day_vip.js)、[升级](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/youth_day_vip_upgrade.js)、[听歌活动](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/youth_listen_song.js)。

上游旧广告模块构造广告播放起止时间；不建议直接照搬为后台默认任务。这里建议先实现会员状态、正常活动入口与手动领取，不做假播放/假广告上报，也不开放任意日期批量领取。

## 播放权限必须单独验证

概念版有独立会员产品；不能推导为“领取后普通版接口也能播放所有会员歌曲”。官方会员说明仅能支持特定权益方向，不能证明概念版赠送权益反向适用于普通版。[官方会员特权](https://m.kugou.com/vip/v2/privilege.html)

上游已提供歌曲权限查询 `/privilege/lite`、歌曲授权 `/song/auth`、Auth 播放 `/song/url/auth` 和聚合路由 `/song/url/auth/merge`。源码对普通音质、无损及特殊音质做不同权限判断，部分蝰蛇音质需要超级会员。因此，成功登录或领取权益后，仍需逐曲、逐音质验证实际返回的完整流、试听标志与时长，不能只看会员徽章。

来源：[音质权限源码](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/privilege_lite.js)、[歌曲授权](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/song_auth.js)、[Auth 播放](https://github.com/MakcRe/KuGouMusicApi/blob/main/module/song_url_auth.js)。

当前 `CatalogProvider.downloadSource` 未实现时会退回 `songSource`。若概念版播放与下载授权范围不同，应提供专门的下载解析，不能把“可听完整流”直接当作“允许导出下载”的依据。

## 推荐落地方式

1. 定义显式的客户端配置与 Provider 工厂，为普通版、概念版分别传 appid、签名、会话键和播放参数；不要使用进程级环境变量动态切换，因为同一个队列可能混合两种来源。
2. 增加独立 `kugou-lite` 来源和 session，队列、最近播放、缓存键、下载记录均保留来源；复用酷狗歌曲映射和通用界面。
3. 先完成概念版扫码、账号状态、搜索和播放。验证普通版和概念版同时登录、切换来源与混合队列。
4. 加入权益查询、当月记录和手动领取当天权益；结果回读后展示“已领取/无资格/已过期/暂不可用”，请求失败不能记为成功。
5. 若真实账号验证稳定，再增加用户主动开启的“启动时领取”，按 Asia/Shanghai 日期去重；应用关闭时不会执行，不能承诺全天候签到。

## 最低验收矩阵

需要真实概念版账号覆盖：新账号/有活动资格账号、未领取/已领取、登录过期、无会员/概念版会员/超级会员。曲目覆盖免费、会员、单曲购买、无版权，以及 MP3/OGG/FLAC 等实际格式。验证播放和下载各自权限、会员到期时间、领取幂等性，以及旧普通版会话不受影响。

当前调研能确认的是开源实现及集成路径；每日可领时长、账号资格、跨客户端权益和接口稳定性仍需账号实测。上游 API 仓库标注 MIT，若移植源码需保留版权与许可证；签到参考仓库是否可直接复用应另行确认许可。
