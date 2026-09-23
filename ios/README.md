# 装成 iPhone 应用（外壳）

这里是把网页装进一个真正 iOS 应用的那层壳。**只为了一件事：让提醒在 app 关着的时候也能响。**
网页应用（加到主屏幕那种）不允许在后台跑，这是系统规定，改代码解决不了。

网页代码一行都不用重写：应用里跑的就是上一层目录的 `index.html`、`app.js` 那一套文件。

## 壳里有什么

| 文件 | 作用 |
|---|---|
| `TodoList.xcodeproj` | Xcode 工程（已经配好了，直接打开就行；**编译通过，并在模拟器里跑通过**） |
| `TodoList/Info.plist` | 应用的"身份证"：名字、图标、竖屏 |
| `TodoList/AppIcons/` | 应用图标（由 `python3 tools/make-icons.py` 生成，和网页图标同一个脚本） |
| `TodoList/TodoListApp.swift` | 应用入口，就一屏 |
| `TodoList/ContentView.swift` | 那一屏：铺满屏幕的网页视图，打开时问一次"允许通知吗" |
| `TodoList/WebAppViewController.swift` | 网页视图，以及网页干不了的三件事：排提醒、导出（系统分享）、导入（系统文件选择） |
| `TodoList/WebFilesSchemeHandler.swift` | 把打包进应用的网页文件当成一个"网站"提供出去 |
| `TodoList/ReminderCenter.swift` | 把网页交来的提醒单子翻译成 iOS 的本地通知 |
| `../native.js` | 网页这一侧的接线（普通浏览器里什么都不做）。**它有测试**，`ios/` 里的 Swift 没有 |

**网页和外壳怎么说话**：网页往一个"信箱"里投消息，外壳照做。三种消息见 `native.js` 开头的注释。
"哪些提醒该交、交什么内容"全在网页那边算好（有测试盯着），外壳只照单办事。

## 图标为什么不用 Xcode 的"图标目录"

正常做法是把图标放进 `Assets.xcassets`，但那要由 Xcode 的 `actool` 编译，
而 `actool` 在"只装了 Xcode、没装模拟器运行环境"的机器上**直接报错**
（`Failed to locate any simulator runtime`），命令行和 Xcode 里按 ▶️ 都过不去，
要解决就得再下一个 7GB 的模拟器。

所以这里用的是更老但更省事的办法：几张 PNG 直接放进应用里，在 `Info.plist` 的
`CFBundleIconFiles` 里列出来，系统按尺寸自己挑。效果一样，也不需要模拟器。
（真要上架 App Store 的话得换回图标目录，到时候再说。）

## 第一次装到手机上

准备：Mac 上装好 Xcode，一根数据线，一个 Apple ID（免费的就行）。

> **Xcode 要比手机的系统新。** Xcode 15.4 只认到 iOS 17.5，手机是 iOS 18 以上就会报
> `The developer disk image could not be mounted`——这不是工程的问题，是 Xcode 太旧。
> 而新版 Xcode 又要求新版 macOS，所以真机这条路可能要先升级系统。在那之前可以用模拟器（见下）。

1. **同意 Xcode 的许可协议**（装完第一次打开会问；也可以在终端里跑 `sudo xcodebuild -license accept`）。

2. **双击 `ios/TodoList.xcodeproj`** 打开工程。

3. **填上自己的签名信息**（工程里现在填的是占位的 `com.example.todolist`，必须改）：点左边最上面的蓝色工程图标 → TARGETS 里的 TodoList → Signing & Capabilities
   - 勾上 **Automatically manage signing**
   - Team 选你的 Apple ID（没有就点 Add an Account 登录一下）
   - Bundle Identifier 改成别人不会重名的，比如 `com.你的名字.todolist`

4. **装到手机上**：数据线连上 iPhone，手机上点"信任这台电脑"；Xcode 最上面那一排选中你的手机，按 ▶️。
   - 第一次装完手机上打不开、提示"不受信任的开发者"：iPhone 设置 → 通用 → VPN与设备管理 → 点你的 Apple ID → 信任。

5. 打开应用，它会问"允许通知吗"——**要允许**，不然提醒响不了，这个壳也就白做了。

## 免费账号的 7 天

用免费 Apple ID 签名的应用**装上 7 天后会打不开**，要再连电脑按一次 ▶️（数据不会丢，是覆盖安装）。
嫌麻烦就加入 Apple Developer Program（99 美元/年），签名有效期变成一年。

## 以后改了网页代码怎么更新

1. 照常改 `app.js` 这些文件、跑测试
2. 连上手机，在 Xcode 里按一次 ▶️

网页文件在工程里是**引用**（不是复制品），所以改完不用做别的，按 ▶️ 装上去就是最新的。

`sw.js` 和 `manifest.json` 不进这个壳 —— 它们是给"网页版"用的。
**两边的数据是各存各的**，搬家用应用里 ⋯ → 导出数据 / 导入数据。

## 在模拟器里验证（不用手机）

手机连不上（比如 Xcode 版本比手机系统旧）时，模拟器一样能验证绝大部分东西——
**本地通知在模拟器里是真的会弹的**，包括应用已经被杀掉的情况。

```bash
# 1. 编译 + 装进模拟器
xcodebuild -project ios/TodoList.xcodeproj -target TodoList \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
xcrun simctl boot "iPhone 15 Pro"; open -a Simulator
xcrun simctl install booted ios/build/Debug-iphonesimulator/TodoList.app
xcrun simctl launch booted com.你的名字.todolist

# 2. 看一眼长什么样
xcrun simctl io booted screenshot /tmp/shot.png

# 3. 提醒到底排上没有、到点弹没弹（应用杀掉之后照样能查）
xcrun simctl spawn booted log show --last 10m \
  --predicate 'subsystem == "com.apple.UserNotifications"' | grep 你的名字
```

日志里这两行就是关键证据：`Adding notification request …`（排上了）、
`Deliver local notification … at 时间`（到点弹了）。

**截图要掐着点截**：横幅几秒后就自动收走了，晚一分钟去截就只剩桌面，会误判成"没弹"（踩过）。

**想塞点数据进去试**：应用的 localStorage 就是一个 sqlite 文件，值是 UTF-16 编码的：

```bash
xcrun simctl get_app_container booted com.你的名字.todolist data
# 进去找 Library/WebKit/<bundle id>/WebsiteData/Default/<一串哈希>/<同样的哈希>/LocalStorage/localstorage.sqlite3
# 写的时候：INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('todos', <JSON 的 utf-16-le 字节>)
```

改完要先把应用杀掉再写（它开着的时候会占着那个文件），写完再启动。

**模拟器验证不了的**：真机的手感（滑动、键盘）、系统分享面板和文件选择的真实行为、
以及"7 天签名过期"这类只有真机才有的事。

## 装好之后要当场验证的几件事

这层壳**没有自动测试**（网页那半有 375 条，Swift 这半一条没有），所以第一次装上要手动确认：

- [ ] **数据存得住**：加两条任务，把应用划掉重开，任务还在
- [ ] **关着也提醒**：设一个 2 分钟后的提醒，把应用划掉（不是回主屏，是上划关掉），等通知弹出来
- [ ] **改了时间，提醒跟着变**：把那条提醒改晚或删掉，确认旧的不再响
- [ ] **导出**：⋯ → 导出数据 → 系统的分享面板里能存进"文件"
- [ ] **导入**：⋯ → 导入数据 → 选到刚才那个文件，数据进来
- [ ] **附件**：加一张图片，重开应用还看得见
- [ ] 手势（右滑返回、左右滑切标签）、弹键盘时底部不乱跳，和网页版一样

哪条不对就说具体现象。最可能出问题的是第一条：网页数据存在哪、系统认不认，不同 iOS 版本不完全一样
（壳里用自定义地址 `todolist://` 而不是 `file://` 就是为了这个）。

## 万一工程打不开（备用办法）

`TodoList.xcodeproj` 是手写的。万一 Xcode 说它坏了，可以自己新建一个，效果一样：

1. Xcode → File → New → Project → iOS → **App**；Product Name 填 `TodoList`，Interface 选 **SwiftUI**，Language 选 **Swift**
2. 把 Xcode 生成的 `ContentView.swift` 内容换成 `ios/TodoList/ContentView.swift` 的内容（生成的 `TodoListApp.swift` 保留，不用管这里的那份）
3. 把 `WebAppViewController.swift`、`WebFilesSchemeHandler.swift`、`ReminderCenter.swift` 拖进 Xcode（勾 Copy items if needed 和 Add to targets）
4. 把六个网页文件拖进去：`index.html`、`style.css`、`app.js`、`tags.js`、`logs.js`、`native.js`
   （**不要勾 Copy items if needed**，这样以后改网页代码不用再拖一次；要勾 Add to targets）
5. 之后照着上面第 3 步往下做
