import SwiftUI

struct MainTabView: View {
    @State private var homeModel = HomeModel()
    @State private var findModel = FindModel()
    @State private var tab = "home"

    var body: some View {
        tabContent
            .tint(Palette.primary)
    }

    private func findSavedAilments(_ names: [String]) {
        findModel.ailments = names
        tab = "search"
    }

    @ViewBuilder
    private var tabContent: some View {
        if #available(iOS 18, *) {
            TabView(selection: $tab) {
                Tab("Home", systemImage: "house.fill", value: "home") {
                    HomeView(model: homeModel)
                }
                Tab("Search", systemImage: "magnifyingglass", value: "search") {
                    FindView(model: findModel)
                }
                Tab("Account", systemImage: "person.fill", value: "account") {
                    AccountView(onFindAilments: findSavedAilments)
                }
            }
        } else {
            TabView(selection: $tab) {
                HomeView(model: homeModel)
                    .tabItem { Label("Home", systemImage: "house.fill") }
                    .tag("home")
                FindView(model: findModel)
                    .tabItem { Label("Search", systemImage: "magnifyingglass") }
                    .tag("search")
                AccountView(onFindAilments: findSavedAilments)
                    .tabItem { Label("Account", systemImage: "person.fill") }
                    .tag("account")
            }
        }
    }
}

#Preview("Tabs") {
    MainTabView()
        .environment(\.strainAPI, PreviewStrainAPI())
        .environment(AuthSession.previewSignedIn)
        .environment(SavedStrainsStore.preview(["granddaddy-purple"]))
        .environment(RecentlyViewedStore.preview([.sampleGDP]))
        .environment(SavedAilmentsStore.preview(["Insomnia"]))
}
