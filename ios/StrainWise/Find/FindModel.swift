import Foundation

enum ResearchStep: String, CaseIterable, Equatable {
    case leafly = "Pulling full Leafly & Weedmaps profiles…"
    case reddit = "Collecting Reddit quotes for your symptoms…"
    case ranking = "Ranking the best strains with MiniMax AI…"
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
    var compareNames: [String] = []
    var comparison: StrainComparison?
    var isComparing = false

    @ObservationIgnored private let api: any StrainServicing
    @ObservationIgnored private var stepTask: Task<Void, Never>?

    init(api: any StrainServicing = LiveStrainAPI()) {
        self.api = api
    }

    var canFind: Bool { !ailments.isEmpty && !isRunning }

    var canLookup: Bool {
        !lookupQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLookingUp
    }

    var canCompare: Bool { compareNames.count >= 2 && compareNames.count <= 3 && !isComparing }

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
                reliefSummary: reliefSummary
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
            if let found = try await api.search(name: name) {
                return found
            }
            lookupError = "No profile for “\(name)” yet."
            return nil
        } catch {
            lookupError = error.localizedDescription
            return nil
        }
    }

    func addToCompare(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if !compareNames.contains(where: { $0.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            if compareNames.count < 3 { compareNames.append(trimmed) }
        }
    }

    func removeFromCompare(_ name: String) {
        compareNames.removeAll { $0.caseInsensitiveCompare(name) == .orderedSame }
    }

    /// Toggle a strain in the compare selection — used by the recommendation
    /// card's "Add to compare" button so a research session doesn't auto-run
    /// a comparison.
    func toggleCompare(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if compareNames.contains(where: { $0.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            removeFromCompare(trimmed)
        } else if compareNames.count < 3 {
            compareNames.append(trimmed)
        }
    }

    func isInCompare(_ name: String) -> Bool {
        compareNames.contains { $0.caseInsensitiveCompare(name) == .orderedSame }
    }

    /// True when adding a new strain would exceed the 3-strain cap.
    var compareAtCap: Bool { compareNames.count >= 3 }

    func compareSelected(reliefSummary: String? = nil) async {
        guard canCompare else { return }
        isComparing = true
        errorMessage = nil
        defer { isComparing = false }
        do {
            comparison = try await api.compare(
                strainNames: compareNames,
                conditions: ailments,
                prefs: prefs,
                reliefSummary: reliefSummary
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reset() {
        result = nil
        comparison = nil
        errorMessage = nil
        ailments = []
        searched = []
        potency = .any
        prefs = ResearchPrefs()
        lookupQuery = ""
        lookupError = nil
        compareNames = []
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
