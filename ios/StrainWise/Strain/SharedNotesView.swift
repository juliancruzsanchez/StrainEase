import SwiftUI

struct SharedNotesView: View {
    let strainKey: String
    @State private var store = PublicNotesStore()

    var body: some View {
        Group {
            if !store.notes.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Patient community notes")
                    ForEach(store.notes) { note in
                        SWCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(note.note)
                                    .font(.system(size: 15))
                                    .foregroundStyle(Palette.foreground)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(note.authorName.uppercased())
                                    .font(.system(size: 10, weight: .semibold))
                                    .tracking(1.1)
                                    .foregroundStyle(Palette.primary)
                            }
                        }
                    }
                }
            }
        }
        .task(id: strainKey) {
            store.listen(strainKey: strainKey)
        }
        .onDisappear { store.stop() }
    }
}
