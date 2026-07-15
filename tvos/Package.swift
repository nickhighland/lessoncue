// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "LessonCueProtocol",
    platforms: [.tvOS(.v17), .macOS(.v14)],
    products: [.library(name: "LessonCueProtocol", targets: ["LessonCueProtocol"])],
    targets: [.target(name: "LessonCueProtocol", path: "Sources/Protocol")]
)
