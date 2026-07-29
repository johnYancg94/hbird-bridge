# Hbird Bridge

Hbird Bridge 是一个 Windows 平台的 Photoshop CEP 素材联动面板，用于快速浏览本地图片、导入图层、替换智能对象和整理素材目录。

## 主要功能

- 异步扫描素材目录，支持大量图片的懒加载缩略图。
- 通过齿轮设置素材目录，并自动监听新图片。
- 主工具栏可直接打开当前素材目录，并通过循环图标手动刷新素材。
- 一键归档：保留最新 10 张图片，其余按周归档。
- 新建文档打开和普通像素图层导入。
- 智能对象导入：替换当前图层并保持原位置，完成后自动栅格化目标图层。
- 拷贝当前选区：非破坏性盖印可见内容，将选区生成新图层，并通过临时 PNG 可靠写入 Windows 剪贴板。
- 剪贴板分辨率优化：最长边默认 2560px，超限时仅缩小临时智能对象副本，不改变原图层尺寸。

## 环境要求

- Windows 10/11
- Adobe Photoshop CC 2019 或更高版本
- CEP 调试模式

## 安装

运行 `一键安装.bat`，然后重启 Photoshop。

安装后的扩展目录：

```text
%APPDATA%\Adobe\CEP\extensions\com.hbird.bridge.ps.panel
```

在 Photoshop 中通过“窗口 → 扩展 → Hbird Bridge”打开面板。

## 素材目录规则

插件只读取当前素材目录根目录中的图片。图片归档到子目录后会从面板中消失；不要把待检测图片预先放入 `images` 子目录。

## 测试

```powershell
node --check js/main.js
node tests/asset-utils.test.js
node tests/copy-selection.test.js
node tests/integration.test.js
```

当前版本：`1.6.1`
