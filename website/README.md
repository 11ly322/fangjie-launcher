# UBL 官网

这是 unflod bindery launcher（UBL）的静态官网，部署在 GitHub Pages：

https://11ly322.github.io/fangjie-launcher/

## 本地预览

```powershell
python -m http.server 4173 --directory website
```

打开 http://127.0.0.1:4173/。

## 结构

- `index.html`：单页官网（产品、房间联机、截图、下载、FAQ）
- `styles.css`：深色 + 青柠色设计系统，响应式
- `app.js`：移动菜单、滚动显现、SHA256 复制；无第三方依赖、无分析脚本
- `assets/`：经过压缩的界面截图和图标

## 更新下载链接

发布新版本后，替换 `index.html` 中的功能下载 URL 和 `SHA256` 文案；不要在这里硬编码私有下载地址。

## 部署

`.github/workflows/pages.yml` 在 `main` 更新 `website/` 时，通过 GitHub Pages Actions 发布 `website/`。仓库 Settings → Pages 的 Source 必须设为 **GitHub Actions**。
