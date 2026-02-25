import ExpoModulesCore
import UIKit

public class WebtoonReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WebtoonReader")

    View(WebtoonReaderView.self) {
      Prop("data") { (view: WebtoonReaderView, data: [[String: Any]]) in
        view.updateData(data: data)
      }

      Prop("magnifierConfig") { (view: WebtoonReaderView, config: [String: Any]?) in
        view.updateMagnifierConfig(config: config)
      }

      Events(
        "onEndReached",
        "onChapterChanged",
        "onSingleTap",
        "onPageChanged",
        "onScrollBegin",
        "onLoadingStateChanged",
        "onImageError",
        "onRetryRequested"
      )

      AsyncFunction("scrollToIndex") { (view: WebtoonReaderView, chapterId: String, index: Int) in
        view.scrollToIndex(chapterId: chapterId, index: index)
      }

      AsyncFunction("getCurrentPosition") { (view: WebtoonReaderView) -> [String: Any] in
        return view.getCurrentPosition()
      }

      AsyncFunction("setZoomScale") { (view: WebtoonReaderView, scale: Double) in
        view.setZoomScale(scale: CGFloat(scale))
      }

      AsyncFunction("resetZoom") { (view: WebtoonReaderView) in
        view.resetZoom()
      }

      AsyncFunction("resetSession") { (view: WebtoonReaderView) in
        view.resetSession()
      }
    }
  }
}
