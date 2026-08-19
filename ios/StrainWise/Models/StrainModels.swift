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

struct RedditSource: Hashable, Sendable, Identifiable {
    var url: String
    var subreddit: String
    var title: String
    var snippet: String?
    var score: Int?

    var id: String { url }

    var link: URL { URL(string: url) ?? URL(string: "https://old.reddit.com")! }

    var caption: String {
        var parts = ["r/\(subreddit)"]
        if let score, score > 0 {
            parts.append("\(score) pts")
        }
        return parts.joined(separator: " · ")
    }
}

extension RedditSource: Codable {
    enum CodingKeys: String, CodingKey {
        case url, subreddit, title, snippet, score
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        url = try c.decode(String.self, forKey: .url)
        subreddit = try c.decode(String.self, forKey: .subreddit)
        title = try c.decode(String.self, forKey: .title)
        snippet = try c.decodeIfPresent(String.self, forKey: .snippet)
        if let int = try c.decodeIfPresent(Int.self, forKey: .score) {
            score = int
        } else if let double = try c.decodeIfPresent(Double.self, forKey: .score) {
            score = Int(double)
        } else {
            score = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(url, forKey: .url)
        try c.encode(subreddit, forKey: .subreddit)
        try c.encode(title, forKey: .title)
        try c.encodeIfPresent(snippet, forKey: .snippet)
        try c.encodeIfPresent(score, forKey: .score)
    }
}

struct CommunityNote: Codable, Hashable, Sendable, Identifiable {
    var source: String
    var text: String
    /// Backend-supplied source tag (`leafly`, `weedmaps`, `reddit`,
    /// `other`). Falls back to a heuristic off the `source` string when
    /// the backend omits it (older profiles + preview data).
    var kind: String?

    var id: String { "\(source)|\(text.prefix(80))" }

    var isReddit: Bool {
        resolvedKind == "reddit"
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

    /// Tag used for tab filtering. Prefers the backend value; falls
    /// back to matching the `source` string so older profiles without
    /// `kind` still split correctly across tabs.
    var resolvedKind: String {
        if let kind, !kind.isEmpty { return kind.lowercased() }
        let s = source.lowercased()
        if s.contains("reddit") { return "reddit" }
        if s.contains("weedmaps") { return "weedmaps" }
        if s.contains("leafly") { return "leafly" }
        return "other"
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

struct RecommendationResult: Codable, Hashable, Sendable {
    var headline: String
    var summary: String
    var recommendations: [StrainRecommendation]
    var strains: [StrainProfile]
    var redditSources: [RedditSource]? = nil
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
    var redditSources: [RedditSource]? = nil
}

struct StrainComparison: Codable, Hashable, Sendable {
    var strains: [StrainProfile]
    var analysis: StrainAnalysis
    var resultId: String?

    static let sample = StrainComparison(
        strains: [],
        analysis: StrainAnalysis(
            headline: "",
            summary: "",
            forCondition: nil,
            keyDifferences: [],
            commonGround: [],
            cautions: []
        ),
        resultId: nil
    )
}

/// One section of the patient-tailored strain description returned by
/// `describeStrainForUser`. Always rendered as a small block with an
/// eyebrow heading and a prose body.
struct StrainDescriptionSection: Codable, Hashable, Sendable {
    var heading: String
    var body: String
}

/// Result shape for the `elaborateSection` callable — a single
/// short prose expansion of one of the three tailored-description
/// sections, written for this strain and the caller's saved
/// ailments / medications / relief-log history.
struct ElaboratedSection: Codable, Hashable, Sendable {
    var elaboration: String
}

/// Three-section, patient-tailored description for a single strain.
/// Always exactly three sections:
///   - "Overview"
///   - "What it might do for you"
///   - "What to expect"
struct StrainDescription: Codable, Hashable, Sendable {
    var sections: [StrainDescriptionSection]

    init(sections: [StrainDescriptionSection]) {
        precondition(sections.count == 3, "StrainDescription must have exactly 3 sections.")
        self.sections = sections
    }

    var overview: StrainDescriptionSection { sections[0] }
    var tailored: StrainDescriptionSection { sections[1] }
    var expectations: StrainDescriptionSection { sections[2] }

    static let sample = StrainDescription(sections: [
        StrainDescriptionSection(
            heading: "Overview",
            body: "A classic daytime-leaning hybrid from the West Coast. Berry- and herbal-leaning aroma with a reputation for a calm, clear-headed lift."
        ),
        StrainDescriptionSection(
            heading: "What it might do for you",
            body: "Reported by patients for chronic pain, stress, and depression — useful when symptoms are dragging you down and you still need to stay functional."
        ),
        StrainDescriptionSection(
            heading: "What to expect",
            body: "Onset is gradual; expect two to three hours of effect. Start with a small amount if you're THC-sensitive, and check in with how you feel before taking more."
        ),
    ])
}
