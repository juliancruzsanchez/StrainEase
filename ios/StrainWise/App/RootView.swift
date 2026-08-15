import SwiftUI

struct RootView: View {
    @Environment(AuthSession.self) private var session

    var body: some View {
        Group {
            switch session.status {
            case .loading:
                ZStack {
                    MeshBackground()
                    ProgressView()
                        .tint(Palette.primary)
                        .controlSize(.large)
                }
            case .signedOut:
                SignInView()
            case .signedIn:
                MainTabView()
            }
        }
        .animation(.snappy(duration: 0.35), value: session.isSignedIn)
    }
}

#Preview("Signed out") {
    RootView()
        .environment(AuthSession.previewSignedOut)
        .environment(SavedStrainsStore.preview())
        .environment(SavedAilmentsStore.preview())
        .environment(RecentlyViewedStore.preview())
}

#Preview("Signed in") {
    RootView()
        .environment(AuthSession.previewSignedIn)
        .environment(SavedStrainsStore.preview())
        .environment(SavedAilmentsStore.preview())
        .environment(RecentlyViewedStore.preview([.sampleGDP]))
}
