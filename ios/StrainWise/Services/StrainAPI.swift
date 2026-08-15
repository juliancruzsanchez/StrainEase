import FirebaseFunctions
import Foundation
import SwiftUI

extension EnvironmentValues {
    @Entry var strainAPI: any StrainServicing = LiveStrainAPI()
}

protocol StrainServicing {
    func recommend(conditions: [String], potency: Potency, prefs: ResearchPrefs, reliefSummary: String?) async throws -> RecommendationResult
    func compare(strainNames: [String], conditions: [String], prefs: ResearchPrefs, reliefSummary: String?) async throws -> StrainComparison
    func search(name: String) async throws -> StrainProfile?
    func popular() async throws -> [StrainProfile]
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
        reliefSummary: String?
    ) async throws -> RecommendationResult {
        var payload: [String: Any] = ["conditions": conditions]
        if potency != .any { payload["potency"] = potency.rawValue }
        let compacted = prefs.compacted(reliefSummary: reliefSummary)
        if !compacted.isEmpty { payload["prefs"] = compacted }
        return try await call("recommendStrainsForConditions", data: payload)
    }

    func compare(
        strainNames: [String],
        conditions: [String],
        prefs: ResearchPrefs,
        reliefSummary: String?
    ) async throws -> StrainComparison {
        var payload: [String: Any] = ["strainNames": strainNames]
        if !conditions.isEmpty { payload["condition"] = conditions }
        let compacted = prefs.compacted(reliefSummary: reliefSummary)
        if !compacted.isEmpty { payload["prefs"] = compacted }
        return try await call("compareStrains", data: payload)
    }

    func search(name: String) async throws -> StrainProfile? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return try await callOptional("searchStrain", data: ["name": trimmed])
    }

    func popular() async throws -> [StrainProfile] {
        try await call("popularStrains", data: [:])
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
        if let message = ns.userInfo["NSLocalizedDescription"] as? String,
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

    func recommend(conditions: [String], potency: Potency, prefs: ResearchPrefs, reliefSummary: String?) async throws -> RecommendationResult {
        result
    }

    func search(name: String) async throws -> StrainProfile? {
        let key = name.lowercased()
        if key.contains("blue") { return .sampleBlueDream }
        if key.contains("granddaddy") || key.contains("purple") { return .sampleGDP }
        return searchResult
    }

    func popular() async throws -> [StrainProfile] {
        StrainCatalog.all
    }

    func compare(strainNames: [String], conditions: [String], prefs: ResearchPrefs, reliefSummary: String?) async throws -> StrainComparison {
        StrainComparison.sample
    }
}
