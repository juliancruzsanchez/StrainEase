import FirebaseAuth
import FirebaseFirestore
import Foundation

/// Persistent medication list per user — same `users/{uid}/medications/{id}`
/// docs as the web app, so the two stay in sync.
@Observable
@MainActor
final class SavedMedicationsStore {
    private(set) var items: [SavedMedicationItem] = []
    private(set) var isBusy = false
    var errorMessage: String?

    @ObservationIgnored private var listener: ListenerRegistration?
    @ObservationIgnored private let previewOnly: Bool

    init() {
        previewOnly = false
    }

    static func preview(_ names: [String] = []) -> SavedMedicationsStore {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        let items = names.enumerated().map { index, name in
            SavedMedicationItem(
                id: "preview-\(index)",
                name: name,
                addedAt: now - index
            )
        }
        return SavedMedicationsStore(previewItems: items)
    }

    private init(previewItems: [SavedMedicationItem]) {
        previewOnly = true
        items = previewItems
    }

    /// Names only, in display order. Used to prefill the Find "Other meds" field.
    var names: [String] { items.map(\.name) }

    /// Joined string for the search prefs.medications field. Mirrors the web
    /// PatientPrefsFields behavior.
    var joinedNames: String { names.joined(separator: ", ") }

    func listen(uid: String) {
        guard !previewOnly else { return }
        listener?.remove()
        listener = Firestore.firestore()
            .collection("users")
            .document(uid)
            .collection("medications")
            .addSnapshotListener { [weak self] snap, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        self.errorMessage = error.localizedDescription
                        return
                    }
                    self.items = (snap?.documents ?? []).map { doc in
                        let data = doc.data()
                        return SavedMedicationItem(
                            id: doc.documentID,
                            name: data["name"] as? String ?? doc.documentID,
                            addedAt: data["addedAt"] as? Int ?? 0
                        )
                    }
                    .sorted { $0.addedAt > $1.addedAt }
                }
            }
    }

    func reset() {
        listener?.remove()
        listener = nil
        items = []
        errorMessage = nil
        isBusy = false
    }

    func add(_ name: String) async {
        let trimmed = String(
            name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(79)
        )
        guard !trimmed.isEmpty, !isBusy else { return }
        if items.contains(where: { $0.name.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            return
        }
        let addedAt = Int(Date().timeIntervalSince1970 * 1000)
        let tempId = "tmp-\(addedAt)"
        items.insert(SavedMedicationItem(id: tempId, name: trimmed, addedAt: addedAt), at: 0)
        errorMessage = nil
        guard !previewOnly else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await Firestore.firestore()
                .collection("users")
                .document(try currentUID())
                .collection("medications")
                .addDocument(data: ["name": trimmed, "addedAt": addedAt])
        } catch {
            items.removeAll { $0.id == tempId }
            errorMessage = error.localizedDescription
        }
    }

    func remove(_ item: SavedMedicationItem) async {
        guard !items.isEmpty else { return }
        let previous = items
        items.removeAll { $0.id == item.id }
        errorMessage = nil
        guard !previewOnly else { return }
        guard !item.id.hasPrefix("tmp-") else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await Firestore.firestore()
                .collection("users")
                .document(try currentUID())
                .collection("medications")
                .document(item.id)
                .delete()
        } catch {
            items = previous
            errorMessage = error.localizedDescription
        }
    }

    private func currentUID() throws -> String {
        guard let uid = Auth.auth().currentUser?.uid else {
            throw StrainAPIError.message("Sign in to save medications.")
        }
        return uid
    }
}

struct SavedMedicationItem: Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var addedAt: Int
}