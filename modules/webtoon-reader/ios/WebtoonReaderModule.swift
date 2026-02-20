import ExpoModulesCore
import UIKit

public class WebtoonReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WebtoonReader")

    View(WebtoonReaderView.self) {
      Prop("data") { (view: WebtoonReaderView, data: [[String: Any]]) in
        view.updateData(data: data)
      }

      Events("onEndReached", "onChapterChanged", "onSingleTap", "onPageChanged")
      
      AsyncFunction("scrollToIndex") { (view: WebtoonReaderView, chapterId: String, index: Int) in
        view.scrollToIndex(chapterId: chapterId, index: index)
      }
    }
  }
}
