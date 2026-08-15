import FirebaseFirestore
import Foundation

struct PublicNote: Identifiable, Hashable, Sendable {
    var id: String
    var strainKey: String
    var strainName: String
    var note: String
    var authorName: String
    var createdAt: Int
}

/// Live `publicNotes` for one strain — same collection as the web app.
@Observable
@MainActor
final class PublicNotesStore {
    private(set) var notes: [PublicNote] = []
    @ObservationIgnored private var listener: ListenerRegistration?
    @ObservationIgnored private let previewOnly: Bool

    init() {
        previewOnly = false
    }

    static func preview(_ notes: [PublicNote] = []) -> PublicNotesStore {
        PublicNotesStore(previewNotes: notes)
    }

    private init(previewNotes: [PublicNote]) {
        previewOnly = true
        notes = previewNotes
    }

    func listen(strainKey: String) {
        guard !previewOnly else { return }
        listener?.remove()
        notes = []
        guard !strainKey.isEmpty else { return }
        listener = Firestore.firestore()
            .collection("publicNotes")
            .whereField("strainKey", isEqualTo: strainKey)
            .addSnapshotListener { [weak self] snap, _ in
                Task { @MainActor in
                    self?.notes = (snap?.documents ?? []).compactMap { doc in
                        let data = doc.data()
                        guard let text = data["note"] as? String else { return nil }
                        return PublicNote(
                            id: doc.documentID,
                            strainKey: data["strainKey"] as? String ?? strainKey,
                            strainName: data["strainName"] as? String ?? "",
                            note: text,
                            authorName: data["authorName"] as? String ?? "A patient",
                            createdAt: data["createdAt"] as? Int ?? 0
                        )
                    }
                    .sorted { $0.createdAt > $1.createdAt }
                }
            }
    }

    func stop() {
        listener?.remove()
        listener = nil
        notes = []
    }
}
