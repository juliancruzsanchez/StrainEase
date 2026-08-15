import FirebaseAuth
import FirebaseFirestore
import Foundation

/// Saved symptom chips — same `users/{uid}` fields as the web app.
@Observable
@MainActor
final class SavedAilmentsStore {
    private(set) var ailments: [String] = []
    private(set) var isBusy = false
    var errorMessage: String?

    @ObservationIgnored private var listener: ListenerRegistration?
    @ObservationIgnored private let previewOnly: Bool

    init() {
        previewOnly = false
    }

    static func preview(_ ailments: [String] = []) -> SavedAilmentsStore {
        SavedAilmentsStore(previewAilments: ailments)
    }

    private init(previewAilments: [String]) {
        previewOnly = true
        ailments = Self.normalize(previewAilments)
    }

    func listen(uid: String) {
        guard !previewOnly else { return }
        listener?.remove()
        listener = Firestore.firestore()
            .collection("users")
            .document(uid)
            .addSnapshotListener { [weak self] snap, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        self.errorMessage = error.localizedDescription
                        return
                    }
                    self.ailments = Self.normalize(snap?.data()?["ailments"] as? [Any])
                }
            }
    }

    func reset() {
        listener?.remove()
        listener = nil
        ailments = []
        errorMessage = nil
        isBusy = false
    }

    func save(_ next: [String]) async {
        let normalized = Self.normalize(next)
        let previous = ailments
        ailments = normalized
        errorMessage = nil
        guard !previewOnly else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await Firestore.firestore()
                .collection("users")
                .document(try currentUID())
                .setData(
                    [
                        "ailments": normalized,
                        "ailmentsUpdatedAt": Int(Date().timeIntervalSince1970 * 1000),
                    ],
                    merge: true
                )
        } catch {
            ailments = previous
            errorMessage = error.localizedDescription
        }
    }

    func toggle(_ name: String) async {
        if let index = ailments.firstIndex(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) {
            var next = ailments
            next.remove(at: index)
            await save(next)
        } else {
            await save(ailments + [name])
        }
    }

    func isSelected(_ name: String) -> Bool {
        ailments.contains { $0.caseInsensitiveCompare(name) == .orderedSame }
    }

    static func normalize(_ list: [Any]?) -> [String] {
        guard let list else { return [] }
        return normalize(list.compactMap { $0 as? String })
    }

    static func normalize(_ list: [String]) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for raw in list {
            let name = String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(47))
            guard !name.isEmpty else { continue }
            let key = name.lowercased()
            if seen.contains(key) { continue }
            seen.insert(key)
            out.append(name)
            if out.count >= 16 { break }
        }
        return out
    }

    static func equal(_ a: [String], _ b: [String]) -> Bool {
        a.map { $0.lowercased() }.sorted() == b.map { $0.lowercased() }.sorted()
    }

    private func currentUID() throws -> String {
        guard let uid = Auth.auth().currentUser?.uid else {
            throw StrainAPIError.message("Sign in to save ailments.")
        }
        return uid
    }
}
