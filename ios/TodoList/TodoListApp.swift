// 应用的入口。就一屏，内容全在 ContentView 里。
//
// 说明：如果你是照着 ios/README.md 用 Xcode 的模板自己新建的工程，
// 模板已经生成了一个一模一样的文件（名字可能叫 XXXApp.swift），那就不用这一份。

import SwiftUI

@main
struct TodoListApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
