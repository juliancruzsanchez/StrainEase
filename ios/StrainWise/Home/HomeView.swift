import SwiftUI

struct HomeView: View {
    @Environment(RecentlyViewedStore.self) private var recents
    @Environment(SavedAilmentsStore.self) private var savedAilments
    @State private var model: HomeModel
    @State private var path: [BrowseDestination] = []

    init(model: HomeModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                MeshBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        hero
                        typeRail(.directory)
                        typeRail(.popular)
                        AilmentCarousel(
                            ailments: orderedAilments,
                            preview: { Array(model.strains(for: .ailment($0)).prefix(model.previewLimit)) },
                            onSeeMore: { name in openGrid(.ailment(name), model.strains(for: .ailment(name))) },
                            onSelect: openProfile
                        )
                        typeRail(.sativa)
                        typeRail(.hybrid)
                        typeRail(.indica)
                        StrainRail(
                            title: HomeSection.recents.title,
                            strains: Array(recents.items.prefix(model.previewLimit)),
                            emptyText: "Open a strain and it’ll land here.",
                            onSeeMore: { openGrid(.recents, recents.items) },
                            onSelect: openProfile
                        )
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
                .refreshable { await model.load() }
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 8) {
                        Image("AppLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 26, height: 26)
                            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                        Text("StrainEase")
                            .font(.system(.headline, design: .serif))
                            .foregroundStyle(Palette.foreground)
                    }
                    .accessibilityHidden(true)
                }
            }
            .navigationDestination(for: BrowseDestination.self) { destination in
                switch destination {
                case .profile(let profile):
                    StrainDetailView(profile: profile)
                case .grid(let section, let strains):
                    StrainGridView(title: section.title, strains: strains, onSelect: openProfile)
                }
            }
            .task { await model.load() }
        }
        .tint(Palette.primary)
    }

    private var orderedAilments: [String] {
        let saved = savedAilments.ailments
        guard !saved.isEmpty else { return model.ailments }
        let rest = model.ailments.filter { name in
            !saved.contains { $0.caseInsensitiveCompare(name) == .orderedSame }
        }
        return saved + rest
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: "Browse")
            Text("Find a strain that fits tonight")
                .font(.system(.largeTitle, design: .serif).weight(.regular))
                .foregroundStyle(Palette.foreground)
            Text("Popular picks, symptoms, and phenotypes — tap See more for the full grid.")
                .font(.system(size: 15))
                .foregroundStyle(Palette.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func typeRail(_ section: HomeSection) -> some View {
        StrainRail(
            title: section.title,
            strains: model.preview(section),
            onSeeMore: { openGrid(section, model.strains(for: section)) },
            onSelect: openProfile
        )
    }

    private func openProfile(_ profile: StrainProfile) {
        path.append(.profile(profile))
    }

    private func openGrid(_ section: HomeSection, _ strains: [StrainProfile]) {
        path.append(.grid(section, strains))
    }
}

#Preview("Home") {
    HomeView(model: HomeModel(api: PreviewStrainAPI()))
        .environment(\.strainAPI, PreviewStrainAPI())
        .environment(RecentlyViewedStore.preview([.sampleGDP, .sampleBlueDream]))
        .environment(SavedStrainsStore.preview())
        .environment(SavedAilmentsStore.preview(["Insomnia", "Anxiety"]))
}
