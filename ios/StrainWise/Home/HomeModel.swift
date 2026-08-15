import Foundation

enum HomeSection: Hashable, Identifiable {
    case recents
    case sativa
    case hybrid
    case indica
    case ailment(String)
    case popular
    case directory

    var id: String {
        switch self {
        case .recents: "recents"
        case .sativa: "sativa"
        case .hybrid: "hybrid"
        case .indica: "indica"
        case .ailment(let name): "ailment-\(name)"
        case .popular: "popular"
        case .directory: "directory"
        }
    }

    var title: String {
        switch self {
        case .recents: "Recently viewed"
        case .sativa: "Sativa"
        case .hybrid: "Hybrid"
        case .indica: "Indica"
        case .ailment(let name): name
        case .popular: "Popular strains"
        case .directory: "Strain directory"
        }
    }
}

@Observable
@MainActor
final class HomeModel {
    var popular: [StrainProfile] = []
    var isLoading = false
    var errorMessage: String?

    let ailments = Conditions.catalog
    let previewLimit = 6

    @ObservationIgnored private let api: any StrainServicing

    init(api: any StrainServicing = LiveStrainAPI()) {
        self.api = api
    }

    func load() async {
        isLoading = popular.isEmpty
        errorMessage = nil
        do {
            popular = StrainCatalog.unique(try await api.popular())
        } catch {
            errorMessage = error.localizedDescription
            if popular.isEmpty { popular = [] }
        }
        isLoading = false
    }

    func strains(for section: HomeSection) -> [StrainProfile] {
        switch section {
        case .recents:
            []
        case .sativa:
            StrainCatalog.merge(popular, preferringType: .sativa)
        case .hybrid:
            StrainCatalog.merge(popular, preferringType: .hybrid)
        case .indica:
            StrainCatalog.merge(popular, preferringType: .indica)
        case .ailment(let name):
            StrainCatalog.matching(ailment: name, live: popular)
        case .popular:
            StrainCatalog.merge(popular)
        case .directory:
            StrainCatalog.merge(popular)
        }
    }

    func preview(_ section: HomeSection) -> [StrainProfile] {
        Array(strains(for: section).prefix(previewLimit))
    }
}

enum BrowseDestination: Hashable {
    case profile(StrainProfile)
    case grid(HomeSection, [StrainProfile])
}
