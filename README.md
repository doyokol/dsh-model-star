# dsh-model-star

把「模型收藏」做成 DSH 里的星标列表：常用的 provider / model 组合一键收藏，切换时不用每次翻列表。

## 安装

```bash
dsh plugin --profile desktop add link:D:/path/to/dsh-model-star
```

或者手工：

1. 把这个目录放进 profile 的 `node_modules`（junction 或软链即可）；
2. profile 的 `package.json` 里 `dependencies` 加 `"dsh-model-star": "link:D:/path/to/dsh-model-star"`；
3. `dsh.profile.bundles` 里加 `dsh-model-star`；
4. 重启 DSH。

## 结构

| 文件 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半边：本地落盘路由 `/dsh-model-star/api` |
| `lib/client.js` | 客户端半边：DSH 里的收藏面板 |
| `cordis.patch.yml` | bundle 补丁，挂载上面的路由 |
| `package.json` | 包声明（`dsh.bundle` + `dsh.client`） |

## License

MIT
