import GoogleSignIn
import SwiftUI

@main
struct StrainEaseApp: App {
    @State private var session = AuthSession()
    @State private var ageVerification = AgeVerificationStore()
    @State private var saved = SavedStrainsStore()
    @State private var ailments = SavedAilmentsStore()
    @State private var medications = SavedMedicationsStore()
    @State private var relief = ReliefLogStore()
    @State private var recents = RecentlyViewedStore()
    @State private var history = ResearchHistoryStore()

    init() {
        FirebaseBootstrap.configure()
        StrainImageCache.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(ageVerification)
                .environment(saved)
                .environment(ailments)
                .environment(medications)
                .environment(relief)
                .environment(recents)
                .environment(history)
                .tint(Palette.primary)
                .preferredColorScheme(nil)
                .onAppear { session.start() }
                .onChange(of: session.user?.uid, initial: true) { _, uid in
                    if let uid {
                        saved.listen(uid: uid)
                        ailments.listen(uid: uid)
                        medications.listen(uid: uid)
                        relief.listen(uid: uid)
                        history.listen(uid: uid)
                    } else {
                        saved.reset()
                        ailments.reset()
                        medications.reset()
                        relief.reset()
                        history.reset()
                    }
                }
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}