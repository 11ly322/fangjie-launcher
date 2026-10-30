# Windows 代码签名与 SmartScreen

目标：让 `UBL.exe` 和 NSIS 安装包具备可验证的 Authenticode 签名，并逐步建立 SmartScreen 声誉。代码签名不能保证立即消除警告，尤其是新证书和下载量较低的版本。

## 证书选择

- **OV Authenticode**：成本较低，仍需建立 SmartScreen 声誉。
- **EV Authenticode**：通常更快建立声誉，但成本和硬件/云签名依赖更高。
- 私钥不得以明文 PFX 提交到仓库；使用 Azure Trusted Signing、云 HSM 或受控 CI secret。

## 工具

`signtool` 可用时优先使用；没有 Windows SDK 时，脚本会回退到 PowerShell `Set-AuthenticodeSignature`，仍要求可导出私钥的 PFX。自签名证书只适合测试，Windows 仍会显示未知发布者。

## 签名顺序

1. 构建 `UBL.exe`。
2. 用 `signtool` 对主程序签名。
3. 构建 NSIS 安装包。
4. 对 Setup.exe 再次签名。
5. 生成 SHA256SUMS。
6. 上传带签名的安装包和校验文件。

完整脚本见 [`scripts/sign-windows.ps1`](../scripts/sign-windows.ps1)：

```powershell
$env:FJ_SIGN_CERT_PATH = 'C:\secure\ubl.pfx'
$env:FJ_SIGN_CERT_PASSWORD = '<from secret store>'
./scripts/sign-windows.ps1 -Path 'release\UBL-win32-x64\Fangjie.exe'
./scripts/sign-windows.ps1 -Path 'release\UBL-Launcher-0.0.5-Setup.exe'
```

CI 中不要把 PFX 写入磁盘明文；优先使用 Azure Trusted Signing 的 GitHub Action 或短期证书挂载。时间戳必须使用 RFC3161 服务。

## SmartScreen

- 首次发布仍可能显示“未知发布者”，直到 Microsoft 建立声誉。
- 保持相同的 publisher 名称、证书主体和稳定的下载域名。
- 发布说明中提供 SHA256；用户可先校验再运行。
- 不要建议用户关闭 SmartScreen 或添加排除项。
- 如果证书轮换，提前在 Release Notes 说明新的签名主体和指纹。

## 验证清单

- [ ] `Get-AuthenticodeSignature` 显示 `Valid`。
- [ ] 时间戳存在且可验证。
- [ ] 安装包和主程序使用同一发布者。
- [ ] `SHA256SUMS.txt` 与实际文件一致。
- [ ] 从干净 Windows 虚拟机下载并运行，记录 SmartScreen 行为。
- [ ] 不把证书密码写入日志、构建产物或 Git。
