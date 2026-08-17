import Foundation

enum ResearchStep: String, CaseIterable, Equatable {
    case leafly = "Pulling full Leafly & Weedmaps profiles…"
    case reddit = "Collecting Reddit quotes for your symptoms…"
    case ranking = "Ranking the best strains with Dr. Kaya…"
}

@Observable
@MainActor
final class FindModel {
    var ailments: [String] = []
    var customAilment = ""
    var potency: Potency = .any
    var prefs = ResearchPrefs()
    var result: RecommendationResult?
    var searched: [String] = []
    var isRunning = false
    var step: ResearchStep = .leafly
    var errorMessage: String?
    var lookupQuery = ""
    var lookupError: String?
    var isLookingUp = false

    @ObservationIgnored private let api: any StrainServicing
    @ObservationIgnored private weak var compareStore: CompareSelectionStore?
    @ObservationIgnored private var stepTask: Task<Void, Never>?

    /// `compareStore` is the shared selection + comparison result store
    /// owned by `MainTabView`. Pass it here so the Find tab can read and
    /// mutate the same selection as the floating tray on every other tab.
    /// Optional for preview helpers that don't need a real store.
    init(api: any StrainServicing = LiveStrainAPI(), compareStore: CompareSelectionStore? = nil) {
        self.api = api
        self.compareStore = compareStore
    }

    var canFind: Bool { !ailments.isEmpty && !isRunning }

    var canCompare: Bool {
        compareStore?.canRunCompare == true && compareStore?.isComparing != true
    }

    var canLookup: Bool {
        !lookupQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLookingUp
    }

    func toggleAilment(_ name: String) {
        if let index = ailments.firstIndex(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) {
            ailments.remove(at: index)
        } else {
            ailments.append(name)
        }
    }

    func isSelected(_ name: String) -> Bool {
        ailments.contains { $0.caseInsensitiveCompare(name) == .orderedSame }
    }

    func addCustomAilment() {
        let trimmed = customAilment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if !isSelected(trimmed) { ailments.append(trimmed) }
        customAilment = ""
    }

    func applyAilments(_ names: [String], replace: Bool = false) {
        if replace { ailments = [] }
        for raw in names {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !isSelected(trimmed) else { continue }
            ailments.append(trimmed)
        }
    }

    func applyRestored(result: RecommendationResult, conditions: [String]) {
        self.result = result
        errorMessage = nil
        searched = conditions
        applyAilments(conditions, replace: true)
    }

    func find(reliefSummary: String? = nil) async {
        guard canFind else { return }
        isRunning = true
        errorMessage = nil
        searched = ailments
        startSteps()
        defer {
            isRunning = false
            stopSteps()
        }
        do {
            result = try await api.recommend(
                conditions: ailments,
                potency: potency,
                prefs: prefs,
                reliefSummary: reliefSummary,
                language: StrainAILanguage.preferred
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func lookup() async -> StrainProfile? {
        let name = lookupQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        isLookingUp = true
        lookupError = nil
        defer { isLookingUp = false }
        do {
            if let found = try await api.search(name: name, conditions: ailments) {
                return found
            }
            lookupError = "No profile for “\(name)” yet."
            return nil
        } catch {
            lookupError = error.localizedDescription
            return nil
        }
    }

    // MARK: - Compare selection (delegates to CompareSelectionStore)

    @discardableResult
    func addToCompare(_ name: String) -> Bool {
        compareStore?.add(name) ?? false
    }

    func removeFromCompare(_ name: String) {
        compareStore?.remove(name)
    }

    @discardableResult
    func toggleCompare(_ name: String) -> Bool {
        compareStore?.toggle(name) ?? false
    }

    func isInCompare(_ name: String) -> Bool {
        compareStore?.isIn(name) ?? false
    }

    var compareAtCap: Bool { compareStore?.atCap ?? false }

    func compareSelected(reliefSummary: String? = nil) async {
        guard let compareStore, canCompare else { return }
        await compareStore.runCompare(
            api: api,
            conditions: ailments,
            prefs: prefs,
            reliefSummary: reliefSummary
        )
    }

    func reset() {
        result = nil
        errorMessage = nil
        ailments = []
        searched = []
        potency = .any
        prefs = ResearchPrefs()
        lookupQuery = ""
        lookupError = nil
        // Compare-side cleanup. We don't touch `isComparing` or
        // `compareError` mid-run — those clear themselves when
        // `runCompare` finishes.
        compareStore?.clear()
        compareStore?.comparison = nil
    }

    private func startSteps() {
        step = .leafly
        stepTask?.cancel()
        stepTask = Task { [weak self] in
            let order = ResearchStep.allCases
            for (index, next) in order.enumerated() {
                guard !Task.isCancelled else { return }
                await MainActor.run { self?.step = next }
                if index < order.count - 1 {
                    try? await Task.sleep(for: .milliseconds(1600))
                }
            }
        }
    }

    private func stopSteps() {
        stepTask?.cancel()
        stepTask = nil
    }
}

extension FindModel {
    static var previewEmpty: FindModel {
        FindModel(api: PreviewStrainAPI())
    }

    static var previewFilled: FindModel {
        let model = FindModel(api: PreviewStrainAPI())
        model.ailments = ["Insomnia"]
        model.searched = ["Insomnia"]
        model.result = .sample
        return model
    }
}