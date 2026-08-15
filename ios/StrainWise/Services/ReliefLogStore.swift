import FirebaseAuth
import FirebaseFirestore
import Foundation

enum ReliefFit: String, CaseIterable, Identifiable, Sendable {
    case tooWeak = "too-weak"
    case justRight = "just-right"
    case tooStrong = "too-strong"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .tooWeak: "Too weak"
        case .justRight: "Just right"
        case .tooStrong: "Too strong"
        }
    }
}

struct ReliefLog: Identifiable, Hashable, Sendable {
    var id: String
    var strainName: String
    var conditions: [String]
    var fit: ReliefFit
    var relief: Int
    var note: String
    var createdAt: Int
}

/// Same `users/{uid}/reliefLogs/{id}` docs as the web app.
@Observable
@MainActor
final class ReliefLogStore {
    private(set) var logs: [ReliefLog] = []
    private(set) var isBusy = false
    var errorMessage: String?

    @ObservationIgnored private var listener: ListenerRegistration?
    @ObservationIgnored private let previewOnly: Bool

    init() {
        previewOnly = false
    }

    static func preview(_ logs: [ReliefLog] = []) -> ReliefLogStore {
        ReliefLogStore(previewLogs: logs)
    }

    private init(previewLogs: [ReliefLog]) {
        previewOnly = true
        logs = previewLogs
    }

    func listen(uid: String) {
        guard !previewOnly else { return }
        listener?.remove()
        listener = Firestore.firestore()
            .collection("users")
            .document(uid)
            .collection("reliefLogs")
            .addSnapshotListener { [weak self] snap, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        self.errorMessage = error.localizedDescription
                        return
                    }
                    self.logs = (snap?.documents ?? []).compactMap { Self.parse($0) }
                        .sorted { $0.createdAt > $1.createdAt }
                }
            }
    }

    func reset() {
        listener?.remove()
        listener = nil
        logs = []
        errorMessage = nil
        isBusy = false
    }

    func logs(for strainName: String) -> [ReliefLog] {
        let key = strainName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return logs.filter { $0.strainName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == key }
    }

    func add(
        strainName: String,
        conditions: [String],
        fit: ReliefFit,
        relief: Int,
        note: String
    ) async {
        let createdAt = Int(Date().timeIntervalSince1970 * 1000)
        let log = ReliefLog(
            id: "preview-\(createdAt)",
            strainName: String(strainName.prefix(79)),
            conditions: Array(conditions.prefix(6)),
            fit: fit,
            relief: min(5, max(1, relief)),
            note: String(note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(400)),
            createdAt: createdAt
        )
        logs.insert(log, at: 0)
        errorMessage = nil
        guard !previewOnly else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            _ = try await Firestore.firestore()
                .collection("users")
                .document(try currentUID())
                .collection("reliefLogs")
                .addDocument(data: Self.document(log))
        } catch {
            logs.removeAll { $0.id == log.id }
            errorMessage = error.localizedDescription
        }
    }

    var summary: String {
        logs.prefix(8).map { log in
            let cond = log.conditions.first ?? "general"
            return "\(log.strainName) for \(cond): \(log.fit.rawValue), relief \(log.relief)/5"
        }
        .joined(separator: "; ")
    }

    var tonightHint: String? {
        let nights = logs.filter { log in
            log.conditions.contains { Self.isNightCondition($0) }
        }
        if let good = nights.first(where: { $0.fit == .justRight && $0.relief >= 4 }) {
            return "Last time \(good.strainName) helped your sleep. Consider it again tonight."
        }
        if let harsh = nights.first(where: { $0.fit == .tooStrong }) {
            return "\(harsh.strainName) was too strong at night — look for a gentler option."
        }
        return nil
    }

    /// Same as the web `/insomnia|sleep/i` check in `tonightHint`.
    static func isNightCondition(_ condition: String) -> Bool {
        condition.range(
            of: "insomnia|sleep",
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    static func document(_ log: ReliefLog) -> [String: Any] {
        [
            "strainName": log.strainName,
            "conditions": log.conditions,
            "fit": log.fit.rawValue,
            "relief": log.relief,
            "note": log.note,
            "createdAt": log.createdAt,
        ]
    }

    private static func parse(_ doc: QueryDocumentSnapshot) -> ReliefLog? {
        let data = doc.data()
        guard let name = data["strainName"] as? String,
              let fitRaw = data["fit"] as? String,
              let fit = ReliefFit(rawValue: fitRaw)
        else { return nil }
        let relief: Int
        if let n = data["relief"] as? Int {
            relief = n
        } else if let n = data["relief"] as? Double {
            relief = Int(n)
        } else {
            return nil
        }
        return ReliefLog(
            id: doc.documentID,
            strainName: name,
            conditions: data["conditions"] as? [String] ?? [],
            fit: fit,
            relief: relief,
            note: data["note"] as? String ?? "",
            createdAt: data["createdAt"] as? Int ?? 0
        )
    }

    private func currentUID() throws -> String {
        guard let uid = Auth.auth().currentUser?.uid else {
            throw StrainAPIError.message("Sign in to log relief.")
        }
        return uid
    }
}

extension ReliefLog {
    static let sampleSleep = ReliefLog(
        id: "preview-sleep",
        strainName: "Granddaddy Purple",
        conditions: ["Insomnia"],
        fit: .justRight,
        relief: 5,
        note: "Slept through the night.",
        createdAt: 1_700_000_000_000
    )
}
