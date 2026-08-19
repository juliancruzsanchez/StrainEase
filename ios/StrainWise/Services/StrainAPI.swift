import FirebaseFunctions
import Foundation
import SwiftUI

extension EnvironmentValues {
    @Entry var strainAPI: any StrainServicing = LiveStrainAPI()
}

protocol StrainServicing {
    func recommend(conditions: [String], potency: Potency, prefs: ResearchPrefs, reliefSummary: String?, language: String) async throws -> RecommendationResult
    func compare(strainNames: [String], conditions: [String], prefs: ResearchPrefs, reliefSummary: String?, language: String) async throws -> StrainComparison

    func search(name: String, conditions: [String]) async throws -> StrainProfile?
    func popular() async throws -> [StrainProfile]
    func findDoctors(query: DoctorQuery) async throws -> DoctorResult

    /// Record the signed-in caller's age attestation on the server. Sets
    /// the matching custom claim so the AI / doctor callables can enforce
    /// it. The caller must already be signed in.
    func setAgeVerified(region: AgeRegion, birthDate: String, termsAccepted: Bool, privacyAccepted: Bool) async throws

    /// Generate a three-section, patient-tailored description for a
    /// single strain. The middle section is written around the user's
    /// saved ailments, with their medications and recent relief-log
    /// history used to calibrate (caution-only on meds — never "stop
    /// your prescription"). Returns nil when the server can't return
    /// a valid shape — the caller should fall back to the static
    /// `strain.description`.
    func describe(
        strain: StrainProfile,
        ailments: [String],
        medications: [String],
        reliefHistory: String,
        language: String
    ) async throws -> StrainDescription?

    /// Expand one of the three tailored-description sections (e.g. the
    /// "What it might do for you" block) with a deeper take on the
    /// strain + the user's saved ailments / medications / relief log.
    /// Mirrors the ✨ Ask Maya button on the web strain page.
    func elaborate(
        strain: StrainProfile,
        sectionHeading: String,
        sectionBody: String,
        ailments: [String],
        medications: [String],
        reliefHistory: String,
        language: String
    ) async throws -> String
}

/// Default language for AI-written responses. The backend pins output
/// language so descriptions never drift into random Chinese or other
/// languages for strains with international names. Override per-call
/// by passing a different `language` argument.
enum StrainAILanguage {
    /// English (US). The default for users with the en-* locale, which
    /// covers most StrainEase users today.
    static let english = "English"

    /// Resolve the user's preferred AI language from their current
    /// locale. We currently only have translations for English; other
    /// locales fall back to English until we ship localized copy.
    static var preferred: String {
        guard let code = Locale.current.language.languageCode?.identifier else {
            return english
        }
        switch code.lowercased() {
        case "en": return english
        // Add more cases as localized prompts ship.
        default: return english
        }
    }
}

enum StrainAPIError: LocalizedError {
    case unconfigured
    case message(String)

    var errorDescription: String? {
        switch self {
        case .unconfigured:
            "Firebase isn’t configured yet."
        case .message(let text):
            text
        }
    }
}

struct LiveStrainAPI: StrainServicing {
    private let functions: Functions

    init(functions: Functions = Functions.functions()) {
        self.functions = functions
    }

    func recommend(
        conditions: [String],
        potency: Potency,
        prefs: ResearchPrefs,
        reliefSummary: String?,
        language: String
    ) async throws -> RecommendationResult {
        var payload: [String: Any] = ["conditions": conditions]
        if potency != .any { payload["potency"] = potency.rawValue }
        let compacted = prefs.compacted(reliefSummary: reliefSummary)
        if !compacted.isEmpty { payload["prefs"] = compacted }
        payload["language"] = language
        return try await call("recommendStrainsForConditions", data: payload)
    }

    func compare(
        strainNames: [String],
        conditions: [String],
        prefs: ResearchPrefs,
        reliefSummary: String?,
        language: String
    ) async throws -> StrainComparison {
        var payload: [String: Any] = ["strainNames": strainNames]
        if !conditions.isEmpty { payload["condition"] = conditions }
        let compacted = prefs.compacted(reliefSummary: reliefSummary)
        if !compacted.isEmpty { payload["prefs"] = compacted }
        payload["language"] = language
        return try await call("compareStrains", data: payload)
    }


    func search(name: String, conditions: [String] = []) async throws -> StrainProfile? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let payload: [String: Any] = conditions.isEmpty
            ? ["name": trimmed]
            : ["name": trimmed, "conditions": conditions]
        return try await callOptional("searchStrain", data: payload)
    }

    func popular() async throws -> [StrainProfile] {
        try await call("popularStrains", data: [:])
    }

    func findDoctors(query: DoctorQuery) async throws -> DoctorResult {
        var payload: [String: Any] = [:]
        if let lat = query.lat { payload["lat"] = lat }
        if let lon = query.lon { payload["lon"] = lon }
        if let city = query.city, !city.isEmpty { payload["city"] = city }
        if let state = query.state, !state.isEmpty { payload["state"] = state }
        if let zip = query.zip, !zip.isEmpty { payload["zip"] = zip }
        if let radius = query.radiusMiles { payload["radiusMiles"] = radius }
        return try await call("findDoctors", data: payload)
    }

    func setAgeVerified(
        region: AgeRegion,
        birthDate: String,
        termsAccepted: Bool,
        privacyAccepted: Bool
    ) async throws {
        let payload: [String: Any] = [
            "region": region.rawValue,
            "birthDate": birthDate,
            "termsAccepted": termsAccepted,
            "privacyAccepted": privacyAccepted,
        ]
        _ = try await invoke("setAgeVerified", data: payload)
    }

    func describe(
        strain: StrainProfile,
        ailments: [String],
        medications: [String],
        reliefHistory: String,
        language: String
    ) async throws -> StrainDescription? {
        let trimmedName = strain.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return nil }
        let cleanedAilments = ailments
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(16)
        let cleanedMedications = medications
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(24)
        let cleanedRelief = reliefHistory.trimmingCharacters(in: .whitespacesAndNewlines)
        var payload: [String: Any] = [
            "strain": strainDictionary(strain),
            "ailments": Array(cleanedAilments),
            "medications": Array(cleanedMedications),
            "language": language,
        ]
        if !cleanedRelief.isEmpty {
            payload["reliefHistory"] = String(cleanedRelief.prefix(800))
        }
        return try await callOptional("describeStrainForUser", data: payload)
    }

    func elaborate(
        strain: StrainProfile,
        sectionHeading: String,
        sectionBody: String,
        ailments: [String],
        medications: [String],
        reliefHistory: String,
        language: String
    ) async throws -> String {
        let trimmedName = strain.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw StrainAPIError.message("Strain name is required.")
        }
        let trimmedHeading = sectionHeading.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedHeading.isEmpty else {
            throw StrainAPIError.message("Section heading is required.")
        }
        let cleanedAilments = ailments
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(16)
        let cleanedMedications = medications
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(24)
        let cleanedRelief = reliefHistory.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload: [String: Any] = [
            "strain": strainDictionary(strain),
            "sectionHeading": String(trimmedHeading.prefix(80)),
            "sectionBody": String(sectionBody.trimmingCharacters(in: .whitespacesAndNewlines).prefix(2000)),
            "ailments": Array(cleanedAilments),
            "medications": Array(cleanedMedications),
            "language": language,
            "reliefHistory": String(cleanedRelief.prefix(800)),
        ]
        let result = try await call<ElaboratedSection>(name: "elaborateSection", data: payload)
        return result.elaboration
    }

    /// Encode the strain into a plain `[String: Any]` so the backend
    /// gets the same shape it gets from the web client. Mirrors
    /// `StrainProfile` only for the fields `describeStrainPayload` on
    /// the backend actually reads.
    private func strainDictionary(_ strain: StrainProfile) -> [String: Any] {
        var out: [String: Any] = [
            "name": strain.name,
            "inKnowledgeBase": strain.inKnowledgeBase,
        ]
        if let type = strain.type { out["type"] = type.rawValue }
        if let thc = strain.thcRange { out["thcRange"] = thc }
        if let cbd = strain.cbdRange, cbd != "<1%" { out["cbdRange"] = cbd }
        if let lineage = strain.lineage { out["lineage"] = lineage }
        if let terpenes = strain.terpenes {
            out["terpenes"] = terpenes.map { ["name": $0.name, "profile": $0.profile] }
        }
        if let uses = strain.medicalUses { out["medicalUses"] = uses }
        if let effects = strain.effects {
            out["effects"] = effects.map { ["name": $0.name, "intensity": $0.intensity] }
        }
        if let sides = strain.sideEffects { out["sideEffects"] = sides }
        if let description = strain.description { out["description"] = description }
        if let notes = strain.communityNotes {
            out["communityNotes"] = notes.map { ["source": $0.source, "text": $0.text] }
        }
        if let imageUrl = strain.imageUrl { out["imageUrl"] = imageUrl }
        if let rating = strain.leaflyRating { out["leaflyRating"] = rating }
        if let count = strain.leaflyReviewCount { out["leaflyReviewCount"] = count }
        return out
    }

    private func call<T: Decodable>(_ name: String, data: [String: Any]) async throws -> T {
        let raw = try await invoke(name, data: data)
        guard let raw else {
            throw StrainAPIError.message("Empty response from \(name).")
        }
        return try decode(raw)
    }

    private func callOptional<T: Decodable>(_ name: String, data: [String: Any]) async throws -> T? {
        let raw = try await invoke(name, data: data)
        guard let raw, !(raw is NSNull) else { return nil }
        return try decode(raw)
    }

    private func invoke(_ name: String, data: [String: Any]) async throws -> Any? {
        guard FirebaseBootstrap.isConfigured else { throw StrainAPIError.unconfigured }
        do {
            let result = try await functions.httpsCallable(name).call(data)
            return result.data
        } catch {
            throw StrainAPIError.message(Self.friendlyMessage(from: error))
        }
    }

    private func decode<T: Decodable>(_ value: Any) throws -> T {
        let data: Data
        if JSONSerialization.isValidJSONObject(value) {
            data = try JSONSerialization.data(withJSONObject: value)
        } else {
            throw StrainAPIError.message("Couldn’t read the server response.")
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw StrainAPIError.message("Couldn’t read the server response.")
        }
    }

    static func friendlyMessage(from error: Error) -> String {
        let ns = error as NSError
        let info = ns.userInfo
        // Firebase Functions v2 surfaces the server's HttpsError message
        // (e.g. "Select 2–3 strains to compare.") under userInfo["message"].
        // NSLocalizedDescription is just "The operation couldn't be completed
        // (…)" which is useless for end users, so prefer the server text.
        if let message = info["message"] as? String, !message.isEmpty {
            return message
        }
        if let details = info["details"] as? String, !details.isEmpty {
            return details
        }
        if let message = info["NSLocalizedDescription"] as? String,
           !message.isEmpty,
           message != ns.domain
        {
            return message
        }
        return ns.localizedDescription
    }
}

struct PreviewStrainAPI: StrainServicing {
    var result: RecommendationResult = .sample
    var searchResult: StrainProfile? = .sampleGDP

    func recommend(conditions: [String], potency: Potency, prefs: ResearchPrefs, reliefSummary: String?, language: String) async throws -> RecommendationResult {
        result
    }

    func search(name: String, conditions: [String] = []) async throws -> StrainProfile? {
        let key = name.lowercased()
        if key.contains("blue") { return .sampleBlueDream }
        if key.contains("granddaddy") || key.contains("purple") { return .sampleGDP }
        return searchResult
    }

    func popular() async throws -> [StrainProfile] {
        StrainCatalog.all
    }

    func findDoctors(query: DoctorQuery) async throws -> DoctorResult {
        DoctorResult(doctors: [.sample], resolvedLocation: nil, source: "preview")
    }

    func setAgeVerified(region: AgeRegion, birthDate: String, termsAccepted: Bool, privacyAccepted: Bool) async throws {
        // No-op for previews — the gate is local-only in this path.
    }

    func compare(strainNames: [String], conditions: [String], prefs: ResearchPrefs, reliefSummary: String?, language: String) async throws -> StrainComparison {
        StrainComparison.sample
    }

    func describe(
        strain: StrainProfile,
        ailments: [String],
        medications: [String],
        reliefHistory: String,
        language: String
    ) async throws -> StrainDescription? {
        StrainDescription.sample
    }

    func elaborate(
        strain: StrainProfile,
        sectionHeading: String,
        sectionBody: String,
        ailments: [String],
        medications: [String],
        reliefHistory: String,
        language: String
    ) async throws -> String {
        "Maya's take on \(sectionHeading): \(strain.name) shines for the symptoms you flagged — start low, give it time to settle, and check in with how you feel before layering more on top."
    }

}

/// Preview helper that never resolves so strain-detail placeholders stay visible.
struct DelayedPreviewAPI: StrainServicing {
    func recommend(conditions: [String], potency: Potency, prefs: ResearchPrefs, reliefSummary: String?, language: String) async throws -> RecommendationResult {
        try await Task.sleep(for: .seconds(60))
        return .sample
    }

    func search(name: String, conditions: [String] = []) async throws -> StrainProfile? {
        try await Task.sleep(for: .seconds(60))
        return .sampleGDP
    }

    func popular() async throws -> [StrainProfile] {
        StrainCatalog.all
    }

    func findDoctors(query: DoctorQuery) async throws -> DoctorResult {
        try await Task.sleep(for: .seconds(60))
        return DoctorResult(doctors: [.sample], resolvedLocation: nil, source: "preview")
    }

    func setAgeVerified(region: AgeRegion, birthDate: String, termsAccepted: Bool, privacyAccepted: Bool) async throws {
        // No-op for previews.
    }

    func compare(strainNames: [String], conditions: [String], prefs: ResearchPrefs, reliefSummary: String?, language: String) async throws -> StrainComparison {
        try await Task.sleep(for: .seconds(60))
        return StrainComparison.sample
    }

    func describe(
        strain: StrainProfile,
        ailments: [String],
        medications: [String],
        reliefHistory: String,
        language: String
    ) async throws -> StrainDescription? {
        try await Task.sleep(for: .seconds(60))
        return StrainDescription.sample
    }

    func elaborate(
        strain: StrainProfile,
        sectionHeading: String,
        sectionBody: String,
        ailments: [String],
        medications: [String],
        reliefHistory: String,
        language: String
    ) async throws -> String {
        try await Task.sleep(for: .seconds(60))
        return "Maya's take never resolves in this preview — but the production path returns a 2-4 paragraph expansion tailored to the strain and the user's saved ailments."
    }
}
