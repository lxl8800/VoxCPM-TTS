# VoxCPM-TTS
# VoxCPM 2 单文件语音合成工作台说明

> 编写时间：2026年4月11日  
> 项目类型：纯前端单文件页面  
> 页面文件：`VoxCPM-TTS.html`  
> 在线地址：[https://lxl8800.com/tool/html/VoxCPM-TTS.html](https://lxl8800.com/tool/html/VoxCPM-TTS.html)  
> 目标服务：`openbmb/VoxCPM-Demo`  
> 官方 Space：[https://huggingface.co/spaces/openbmb/VoxCPM-Demo](https://huggingface.co/spaces/openbmb/VoxCPM-Demo)  
> 官方最佳实践：[https://voxcpm.readthedocs.io/zh-cn/latest/cookbook.html](https://voxcpm.readthedocs.io/zh-cn/latest/cookbook.html)
> 官方项目：[https://github.com/OpenBMB/VoxCPM/](https://github.com/OpenBMB/VoxCPM/)

* * *

## 使用方式

你可以用两种方式使用这个项目：

1. 在线直接打开：  
   [https://lxl8800.com/tool/html/VoxCPM-TTS.html](https://lxl8800.com/tool/html/VoxCPM-TTS.html)
2. 下载仓库中的 `VoxCPM-TTS.html`，在本地浏览器里直接打开使用

这是一个单文件页面，不依赖本地打包流程，所以可以直接下载打开。

同时，仓库也提供了一个可直接部署到 Cloudflare Workers 的打包目录，用于解决国内无法稳定访问 HuggingFace 的问题。

页面的中转策略现在是：

1. 如果当前站点同源存在 `/api/status`，页面会优先使用同源中转
2. 如果 URL 上带有 `?relay=https://你的中转域名`，页面会优先使用这个中转
3. 如果 HTML 里写了内置中转地址，页面会使用这个中转
4. 如果两者都没有，再尝试直连 HuggingFace

如果你不想自己维护 VPS，可以直接使用 Cloudflare Worker 版本中转。仓库里已附带一个可独立部署的目录：

`voxcpm-worker-relay/`

目录结构：

1. `package.json`
2. `wrangler.jsonc`
3. `src/worker.js`
4. `public/index.html`

这个目录会把前端页面和中转接口一起部署到同一个 Cloudflare Worker 域名下。

它直接通过 `@gradio/client` 连接 `openbmb/VoxCPM-Demo`，并提供：

1. `/` 或 `/index.html`：前端页面
2. `/api/status`
3. `/api/generate`

### 本地单文件使用

直接打开根目录下的 `VoxCPM-TTS.html` 即可。

如果你希望这个单文件页双击打开后就默认走自己的中转，可以直接编辑 HTML 顶部这段配置：

```html
<script type="module">
const BUILTIN_RELAY_BASE = "https://你的域名";
window.VOXCPM_RELAY_BASE = window.VOXCPM_RELAY_BASE || BUILTIN_RELAY_BASE;
</script>
```

默认仓库里这项是空字符串，表示不写死中转地址。

这样做之后，即使你直接本地打开：

```text
file:///D:/Code/AI/TTS/VoxCPM-TTS.html
```

页面也会自动优先连接你写进 HTML 里的中转服务。

如果你本地打开页面，但又想强制走已部署好的 Cloudflare 中转，可以在地址后面加：

```text
?relay=https://你的域名
```

例如：

```text
file:///D:/Code/AI/TTS/VoxCPM-TTS.html?relay=https://your-worker.workers.dev
```

### Cloudflare 打包部署

部署目录是：

`voxcpm-worker-relay/`

把这个目录单独推到 GitHub 后，在 Cloudflare Workers 中导入该仓库或该目录进行部署。

`wrangler.jsonc` 已包含静态资源目录配置，因此部署后：

1. 页面会从同源 `/` 提供
2. 中转接口会从同源 `/api/status` 和 `/api/generate` 提供
3. 前端会自动优先命中同源中转，不需要额外改 HTML

### Fork 后直接部署到 Cloudflare 的教程

如果你希望别人几乎不碰代码就能自己部署，最省事的方式就是：

1. 先 `Fork` 当前项目到自己的 GitHub
2. 再让 Cloudflare 直接导入这个仓库
3. 部署时把工作目录指向 `voxcpm-worker-relay`

具体步骤如下。

#### 第 1 步：Fork 仓库

1. 打开当前项目的 GitHub 页面
2. 点击右上角 `Fork`
3. 选择你自己的 GitHub 账号
4. 等待 GitHub 生成你自己的仓库副本

完成后，你会得到一个你自己名下的仓库，例如：

```text
https://github.com/你的用户名/VoxCPM-TTS
```

#### 第 2 步：进入 Cloudflare 创建 Worker

1. 登录 Cloudflare Dashboard
2. 进入 `Workers & Pages`
3. 点击 `Create`
4. 选择 `Import a repository`
5. 授权 Cloudflare 访问你的 GitHub 仓库
6. 选择刚刚 fork 的这个项目

#### 第 3 步：填写部署配置

如果 Cloudflare 让你填写构建配置，可以这样填：

1. `项目名称`：

```text
voxcpm-relay
```

这个名字要和 `voxcpm-worker-relay/wrangler.jsonc` 里的 `name` 保持一致。

2. `构建命令`：

```text
npm install
```

3. `部署命令`：

```text
npx wrangler deploy
```

4. 如果开启了“非生产分支构建”，`非生产分支部署命令` 可以填：

```text
npx wrangler versions upload
```

5. `路径` 或 `Root directory`：

```text
voxcpm-worker-relay
```

注意：

1. 这里填的是仓库里的目录名，不是网站路径
2. 不要写成 `/voxcpm-worker-relay`
3. 正确写法是不带前导斜杠的 `voxcpm-worker-relay`

6. `Output directory`：

留空即可，因为 Worker 会直接读取 `wrangler.jsonc` 里的 `assets.directory = "./public"`。

7. `Framework preset`：

不选也可以，保持默认。

#### 第 4 步：开始部署

点击部署后，Cloudflare 会自动：

1. 安装 `@gradio/client`
2. 读取 `wrangler.jsonc`
3. 部署 `src/worker.js`
4. 同时把 `public/index.html` 作为前端页面一起发布

部署完成后，你会得到一个类似下面的地址：

```text
https://你的项目名.你的子域.workers.dev
```

#### 第 5 步：验证部署是否成功

先打开：

```text
https://你的域名/api/status
```

正常情况下应返回类似：

```json
{
  "ok": true,
  "relay": "cloudflare-worker",
  "space": "openbmb/VoxCPM-Demo"
}
```

然后再打开首页：

```text
https://你的域名/
```

这时页面会自动优先使用同源中转，不需要再额外改代码。

#### 第 6 步：如果你还想继续保留单文件本地版

根目录下的 `VoxCPM-TTS.html` 依然可以直接下载后本地打开。

如果你在本地打开它，但想让它走你刚部署好的国内中转，可以这样用：

```text
file:///你的本地路径/VoxCPM-TTS.html?relay=https://你的域名
```

这样就能同时满足：

1. 单文件可离线保存
2. 本地打开时可走 Cloudflare 中转
3. 在线部署时自动使用同源中转

#### 两种本地中转写法怎么选

1. 如果这是你自己长期使用的页面，推荐直接把 `BUILTIN_RELAY_BASE` 写进 HTML
2. 如果你想保留一个通用版本给别人，推荐保持 HTML 里为空，然后使用 `?relay=https://你的域名`
3. `?relay=...` 的优先级高于 HTML 里写死的地址，方便临时切换

#### 常见说明

1. 这个 Cloudflare 版本的意义，就是解决国内无法稳定直连 HuggingFace Space 的问题
2. 页面本体和中转接口在同一个 Worker 域名下，部署后最省心
3. 如果后续你更新了根目录的 `VoxCPM-TTS.html`，记得同步更新 `voxcpm-worker-relay/public/index.html`

如果你把页面部署到别的静态站点，而把中转单独部署在另一个域名，也仍然可以在页面前插入：

```html
<script>
window.VOXCPM_RELAY_BASE = "https://你的域名";
</script>
```

或者直接在 URL 上使用 `?relay=https://你的域名`。

* * *

## 一、项目背景

这个页面是一个面向日常使用场景的 VoxCPM 2 语音合成工作台，目标不是做成复杂工程，而是尽量保持：

1. 单文件可打开
2. 页面即开即用
3. 同时支持纯文本风格生成和参考音频克隆
4. 支持批量对白生成
5. 把官方 cookbook 里的使用经验整理成更容易上手的中文界面

整个页面基于浏览器直接连接 HuggingFace Space，不依赖本地后端服务。

* * *

## 二、项目目标

本页面当前主要解决这几件事：

1. 快速验证 VoxCPM 2 的文本转语音能力
2. 让普通用户能直接尝试 Control Instruction 风格设计
3. 让参考音频注册、保存、复用这条链路更顺手
4. 支持多角色对白脚本的批量生成
5. 尽量把常见操作做成可视化按钮，而不是手写参数

* * *

## 三、页面功能总览

### 1. 工作台模式

支持以下组合方式：

1. 纯文本 + Control Instruction
2. 临时上传参考音频 + 文本
3. 临时录音 + 文本
4. 已保存人物 + 文本
5. 已保存人物 + Control Instruction 叠加
6. 临时参考音频 + Control Instruction 叠加

### 2. 人物声音库

支持：

1. 上传音频注册人物
2. 浏览器录音注册人物
3. 本地保存人物名称和参考音频
4. 点击人物直接切换音色
5. 取消当前人物选择
6. 删除已保存人物

说明：

1. 人物数据保存在浏览器本地 `IndexedDB`
2. 换浏览器、清理站点数据后，本地人物库可能丢失
3. 合成时，选中的参考音频仍会发送到远端服务参与生成

### 3. 风格控制

工作台中支持：

1. 手动输入 `Control Instruction`
2. 点击发音风格标签
3. 点击声音特征标签
4. 点击快速风格预设
5. 在正文中插入非语言标签，如 `[laughing]`、`[sigh]`

### 4. 批量对白模式

支持脚本格式：

```text
（1）角色：台词[标签]
（2）角色：台词[标签]
```

页面会自动：

1. 解析序号、角色、正文、标签
2. 尝试按角色名匹配已保存人物
3. 中文标签作为控制指令使用
4. 英文标签如 `[laughing]` 自动插回正文
5. 逐条批量生成
6. 勾选后批量下载

* * *

## 四、界面结构说明

### 工作台页

主要分成四块：

1. 文本与控制指令区
2. 合成结果区
3. 人物声音库
4. 参数与请求说明区

### 批量对白页

主要分成两块：

1. 左侧脚本输入区
2. 右侧生成队列区

### 使用说明页

主要用于整理：

1. 官方最佳实践
2. 示例用法
3. 方言生成建议
4. 参数理解方式

* * *

## 五、当前支持的主要能力

### 1. 文本输入

目标文本支持：

1. 普通中文
2. 中英混合
3. 带非语言标签的文本
4. 方言正文

### 2. Control Instruction

当前页面支持两种常见写法：

1. 中文描述
2. 英文 voice design 描述

例如：

```text
暴躁的中年男声，语速快，充满无奈和愤怒
```

或：

```text
young Chinese maiden, teenage girl, clear, bright, slightly high-pitched voice, light, airy, crisp and delicate, soft and ethereal, not deep or heavy, slow gentle pacing, slightly cute, soft sweet tone
```

### 3. 非语言标签

当前页面内置可插入标签，包括但不限于：

1. `[laughing]`
2. `[sigh]`
3. `[Uhm]`
4. `[Shh]`
5. `[Question-ah]`
6. `[Question-ei]`
7. `[Question-en]`
8. `[Question-oh]`
9. `[Surprise-wa]`
10. `[Surprise-yo]`
11. `[Dissatisfaction-hnn]`

### 4. 请求预览

页面会把本次生成请求显示为 `cURL` 风格预览，方便查看：

1. 当前模式
2. 文本内容
3. Control Instruction
4. 是否带参考音频
5. CFG 系数
6. 文本正则化与降噪开关

* * *

## 六、使用建议

根据官方 cookbook 和实际页面体验，比较推荐这样使用：

1. 先写正文，再决定要不要加控制指令
2. Control Instruction 尽量写成一条完整的人物与声音描述
3. 非语言标签不要堆太多，一句里点到为止
4. 做人物克隆时，参考音频尽量大于 5 秒，且环境安静
5. 想改“情绪、语速、质感”时，更适合叠加 Control Instruction
6. 想固定“谁在说”，优先用参考音频或已保存人物

* * *

## 七、内置示例

### 示例 1：林黛玉

Control Instruction:

```text
young Chinese maiden, teenage girl, clear, bright, slightly high-pitched voice, light, airy, crisp and delicate, soft and ethereal, not deep or heavy, slow gentle pacing, slightly cute, soft sweet tone
```

Target Text:

```text
早知他来，我就不来了。今儿他来，明儿我来，若肯错开些，岂不天天有人来？也不至太热闹，也不至太冷清。谁知你倒偏要凑在一处……叫我这心里，越发不是滋味了。[sigh]
```

### 示例 2：暴躁驾校教练

Control Instruction:

```text
暴躁的中年男声，语速快，充满无奈和愤怒
```

Target Text:

```text
踩离合！踩刹车啊！你往哪儿开呢？前面是树你看不见吗？我教了你八百遍了，打死方向盘！你是不是想把车给我开到沟里去？
```

* * *

## 八、参数说明

### 1. CFG 系数

页面默认值为 `2.0`。

一般理解为：

1. 数值偏低时，结果更自由
2. 数值偏高时，结果通常更贴近参考音频或控制约束
3. 当前页面提示推荐区间为 `1.5 ~ 2.5`

### 2. 文本正则化

开关名：

```text
文本正则化（自动规范数字/标点）
```

前端行为：

1. 这个值会真实随请求一起传给后端
2. 参数名为 `do_normalize`

作用理解：

1. 更适合处理数字、标点、部分文本格式规范
2. 最终效果取决于远端服务是否完整使用该参数

### 3. 参考音频降噪

开关名：

```text
参考音频降噪（提升克隆质量）
```

前端行为：

1. 这个值会真实随请求一起传给后端
2. 参数名为 `denoise`

作用理解：

1. 更偏向参考音频克隆场景
2. 当原始参考音频底噪较明显时更有意义
3. 最终效果同样取决于远端服务是否启用该处理链路

* * *

## 九、人物声音库说明

### 注册方式

支持两种方式：

1. 本地上传音频文件
2. 浏览器直接录音

### 录音处理说明

页面会把浏览器录到的音频尽量转换成标准 `WAV` 文件后再参与生成，原因是：

1. 浏览器原始录音通常是 `webm`
2. 某些后端在处理参考音频时更偏好 `wav`
3. 统一转成 `wav` 后，和上传文件的链路更一致

### 本地存储说明

人物数据保存在浏览器本地，不是服务器持久化账户系统。

这意味着：

1. 当前浏览器可用
2. 清缓存后可能丢失
3. 不会自动同步到其他电脑

* * *

## 十、批量对白工作台说明

### 输入格式

推荐格式：

```text
（1）陆判：朱尔旦，你想不想改命？[阴森神秘]
（2）朱尔旦：你……是庙里的神，还是来索命的鬼？[醉意朦胧中带警惕]
（3）陆判：本官陆判，掌人生死，也判人心。你命薄，心也钝。要不要，本官替你改一改？[威严冷峻]
```

### 解析规则

1. `序号` 用于生成结果排序
2. `角色` 用于匹配人物库
3. `台词` 作为合成正文
4. 方括号里的中文内容当作 `Control Instruction`
5. 方括号里的英文标签会插回正文

### 批量下载命名

批量对白下载文件名格式为：

```text
序号-角色-台词前10个字.wav
```

例如：

```text
1-陆判-朱尔旦你想不想改.wav
```

### 刷新机制

批量页的“刷新队列”会：

1. 重新解析当前脚本
2. 重新尝试匹配人物
3. 清空已生成但未下载的队列音频

因此页面会先弹出确认提示。

* * *

## 十一、已处理过的几个关键问题

在这个页面的迭代过程中，已经处理过这些典型问题：

1. 录音成功但参考音频生成失败  
   已改为优先转 `wav` 再提交

2. 已选择人物时频繁弹大确认框  
   已改为底部轻提示

3. 快速风格预设只改标签、不改输入框  
   已修复为可正确同步到输入框

4. 批量对白角色匹配过于死板  
   已增加更宽松的匹配策略和手动选择

5. 下载文件名被服务端原名覆盖  
   已改成先取 `Blob` 再本地触发下载

* * *

## 十二、适合继续迭代的方向

如果后面继续打磨，这个页面还可以继续增强：

1. 增加“复制 cURL”按钮
2. 批量结果支持打包 ZIP 下载
3. 历史记录显示更明确的文件名预览
4. 支持导出/导入人物库
5. 增加更多官方 cookbook 示例模板
6. 对 `Control Instruction` 做更智能的结构化提示

* * *

## 十三、文件说明

当前目录下的核心文件：

1. `VoxCPM-TTS.html`  
   主页面，包含样式、交互、人物库、批量对白、请求预览

2. `VoxCPM-TTS-说明文档.md`  
   当前这份项目说明文档

* * *

## 十四、总结

`VoxCPM-TTS.html` 适合用来做：

1. VoxCPM 2 页面化测试
2. 日常中文 TTS 尝试
3. 角色音色参考管理
4. 多角色台词批量合成
5. 官方 cookbook 的中文落地实践

它不是完整工程化 SDK，也不是服务端部署项目，而是一份偏实用、偏可直接打开使用的单文件工作台。
