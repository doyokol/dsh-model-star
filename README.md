# dsh-model-star

给 DeepSeek Harness 的模型选择器加**星标收藏**：每个模型行右侧多一颗星，点一下就收藏；收藏的模型会汇总到菜单最顶部的「置顶」分组——**跨供应方全局生效**，换 provider 也能第一眼看到常用的那几个。

## 效果

- 模型列表每一行右侧出现 ☆ 按钮，点一下变实心 ★（再点取消）
- 顶部多一个「置顶」分组，收藏的模型按原顺序排进去
- 收藏跨 provider 合并：`deepseek-account / deepseek-flash` 和 `loomy / DeepSeek-V4.1-Flash` 收藏后并列在置顶里
- 收藏存在宿主侧（落盘），localStorage 只是兜底；换浏览器、清缓存都不丢

## 安装

```bash
dsh plugin --profile desktop add link:D:/path/to/dsh-model-star
```

手工安装：

1. 把目录放进 profile 的 `node_modules`（junction / 软链均可）：

   ```powershell
   cmd /c mklink /J "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-model-star" "D:\path\to\dsh-model-star"
   ```

2. profile 的 `package.json`：

   ```json
   {
     "dependencies": { "dsh-model-star": "link:D:/path/to/dsh-model-star" },
     "dsh": { "profile": { "bundles": ["...", "dsh-model-star"] } }
   }
   ```

3. 重启 DSH，打开模型选择器就能看到星标。

## 结构

| 文件 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半边：落盘接口 `/dsh-model-star/api`（读写收藏列表） |
| `lib/client.js` | 浏览器半边：注入星标按钮、维护「置顶」分组 |
| `cordis.patch.yml` | bundle 补丁，把宿主接口挂进 DSH |
| `package.json` | 包声明（`dsh.bundle` + `dsh.client`） |

## 兼容性

只依赖 DSH 客户端的模型选择器 DOM（通过 class 前缀与 `data-*` 标记定位），DSH 大改选择器结构时需要跟着调。用的是 `MutationObserver`，不阻塞渲染。

## License

MIT
