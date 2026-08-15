import Foundation

enum StrainType: String, Codable, Hashable, Sendable {
    case indica
    case sativa
    case hybrid
}

struct Terpene: Codable, Hashable, Sendable {
    var name: String
    var profile: String
}

struct StrainEffect: Codable, Hashable, Sendable {
    var name: String
    var intensity: Int
}

struct CommunityNote: Codable, Hashable, Sendable, Identifiable {
    var source: String
    var text: String

    var id: String { "\(source)|\(text.prefix(80))" }

    var isReddit: Bool {
        source.lowercased().contains("reddit")
    }

    /// Rating aggregates and site blurbs — not individual patient comments.
    var isAggregate: Bool {
        let src = source.lowercased()
        if src == "leafly community" || src == "weedmaps" || src == "weedmaps listing" {
            return true
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).contains("★")
            && text.range(of: #"^\d+(?:\.\d+)?★"#, options: .regularExpression) != nil
    }
}

struct StrainProfile: Codable, Hashable, Identifiable, Sendable {
    var name: String
    var inKnowledgeBase: Bool
    var type: StrainType?
    var thcRange: String?
    var cbdRange: String?
    var lineage: String?
    var terpenes: [Terpene]?
    var medicalUses: [String]?
    var effects: [StrainEffect]?
    var sideEffects: [String]?
    var description: String?
    var communityNotes: [CommunityNote]?
    var imageUrl: String? = nil
    var leaflyRating: Double? = nil
    var leaflyReviewCount: Int? = nil

    /// Home catalog stubs only carry name / type / THC / uses.
    var isPartial: Bool {
        (description?.isEmpty ?? true)
            && (effects?.isEmpty ?? true)
            && (terpenes?.isEmpty ?? true)
    }

    var quoteNotes: [CommunityNote] {
        (communityNotes ?? []).filter { !$0.isAggregate }
    }

    var resolvedLeaflyRating: (stars: Double, count: Int?)? {
        if let leaflyRating {
            return (leaflyRating, leaflyReviewCount)
        }
        for note in communityNotes ?? [] where note.source.lowercased() == "leafly community" {
            let stars = note.text.firstMatch(of: /(\d+(?:\.\d+)?)★/).flatMap { Double($0.1) }
            guard let stars else { continue }
            let count = note.text.firstMatch(of: /([\d,]+)\s+reviews/).flatMap {
                Int($0.1.replacingOccurrences(of: ",", with: ""))
            }
            return (stars, count)
        }
        return nil
    }

    var id: String { slug }

    var slug: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    var subtitle: String {
        [type.map(TypeStyle.label(for:)), thcRange.map { "THC \($0)" }, cbdCaption]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    private var cbdCaption: String? {
        guard let cbdRange, cbdRange != "<1%" else { return nil }
        return "CBD \(cbdRange)"
    }
}

struct StrainRecommendation: Codable, Hashable, Identifiable, Sendable {
    var strainName: String
    var reason: String
    var bestFor: String
    var caution: String

    var id: String { strainName.lowercased() }
}

struct ConditionPick: Codable, Hashable, Sendable {
    var best: String
    var why: String
    var runnerUp: String
}

struct StrainAnalysis: Codable, Hashable, Sendable {
    var headline: String
    var summary: String
    var forCondition: ConditionPick?
    var keyDifferences: [String]
    var commonGround: [String]
    var cautions: [String]
}

struct StrainComparison: Codable, Hashable, Sendable {
    var strains: [StrainProfile]
    var analysis: StrainAnalysis
    var resultId: String?
}

struct RecommendationResult: Codable, Hashable, Sendable {
    var headline: String
    var summary: String
    var recommendations: [StrainRecommendation]
    var strains: [StrainProfile]
    var resultId: String?

    func profile(named name: String) -> StrainProfile? {
        let key = name.lowercased()
        return strains.first { $0.name.lowercased() == key }
    }
}

enum TimeOfDay: String, CaseIterable, Identifiable, Hashable, Sendable {
    case anytime, morning, afternoon, night
    var id: String { rawValue }
    var label: String {
        switch self {
        case .anytime: "Anytime"
        case .morning: "Morning"
        case .afternoon: "Afternoon"
        case .night: "Night"
        }
    }
}

enum ConsumeForm: String, CaseIterable, Identifiable, Hashable, Sendable {
    case any, flower, cart, edible, tincture
    var id: String { rawValue }
    var label: String {
        switch self {
        case .any: "Any"
        case .flower: "Flower"
        case .cart: "Cart"
        case .edible: "Edible"
        case .tincture: "Tincture"
        }
    }
}

enum ThcSensitivity: String, CaseIterable, Identifiable, Hashable, Sendable {
    case typical
    case anxiousHighThc = "anxious-high-thc"
    case experienced
    var id: String { rawValue }
    var label: String {
        switch self {
        case .typical: "Typical"
        case .anxiousHighThc: "THC-sensitive"
        case .experienced: "Experienced"
        }
    }
    var hint: String? {
        switch self {
        case .typical: nil
        case .anxiousHighThc: "High THC can make me anxious"
        case .experienced: "I tolerate stronger flower"
        }
    }
}

enum Potency: String, CaseIterable, Identifiable, Hashable, Sendable {
    case any = ""
    case mild
    case balanced
    case strong
    var id: String { rawValue.isEmpty ? "any" : rawValue }
    var label: String {
        switch self {
        case .any: "Any"
        case .mild: "Mild"
        case .balanced: "Balanced"
        case .strong: "Strong"
        }
    }
    var hint: String {
        switch self {
        case .any: "No preference"
        case .mild: "THC under ~15%"
        case .balanced: "THC 15–22%"
        case .strong: "THC above ~22%"
        }
    }
}

struct ResearchPrefs: Hashable, Sendable {
    var timeOfDay: TimeOfDay = .anytime
    var consumeForm: ConsumeForm = .any
    var thcSensitivity: ThcSensitivity = .typical
    var medications: String = ""
    var ownedStrainsText: String = ""
    var patientNote: String = ""

    var ownedStrains: [String] {
        ownedStrainsText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// Drops default/empty fields so the callable matches the web `compactPrefs`.
    func compacted(reliefSummary: String? = nil) -> [String: Any] {
        var out: [String: Any] = [:]
        if timeOfDay != .anytime { out["timeOfDay"] = timeOfDay.rawValue }
        if consumeForm != .any { out["consumeForm"] = consumeForm.rawValue }
        if thcSensitivity != .typical { out["thcSensitivity"] = thcSensitivity.rawValue }
        let meds = medications.trimmingCharacters(in: .whitespacesAndNewlines)
        if !meds.isEmpty { out["medications"] = String(meds.prefix(240)) }
        let owned = ownedStrains
        if !owned.isEmpty { out["ownedStrains"] = Array(owned.prefix(8)) }
        let note = patientNote.trimmingCharacters(in: .whitespacesAndNewlines)
        if !note.isEmpty { out["patientNote"] = String(note.prefix(400)) }
        if let reliefSummary, !reliefSummary.isEmpty {
            out["reliefSummary"] = String(reliefSummary.prefix(800))
        }
        return out
    }
}

enum Conditions {
    static let catalog = [
        "Chronic pain",
        "Anxiety",
        "OCD",
        "ADHD",
        "Insomnia",
        "Depression",
        "Nausea & appetite",
        "Inflammation",
        "Migraine",
        "Muscle spasm",
        "PTSD",
        "Fatigue",
        "Arthritis",
        "Stress",
    ]

    static let quick = ["Insomnia", "Chronic pain", "Anxiety", "Migraine"]

    /// Extra medical-use labels that count when browsing a chip.
    static func matchKeys(for ailment: String) -> [String] {
        let key = ailment.trimmingCharacters(in: .whitespacesAndNewlines)
        switch key.lowercased() {
        case "ocd":
            return ["OCD", "Anxiety"]
        case "adhd":
            return ["ADHD", "ADD/ADHD", "ADD"]
        default:
            return [key]
        }
    }
}
