import ExpoModulesCore
import UIKit
import Kingfisher

public class WebtoonReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WebtoonReader")

    View(WebtoonReaderView.self) {
      Prop("data") { (view: WebtoonReaderView, data: [[String: Any]]) in
        view.updateData(data: data)
      }

      Events("onEndReached", "onChapterChanged")
    }
  }
}
