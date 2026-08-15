import SwiftUI

struct SavedAilmentsCard: View {
    @Environment(SavedAilmentsStore.self) private var store
    var onFind: (([String]) -> Void)? = nil

    var body: some View {
        SWCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 4) {
                        SectionLabel("Your ailments")
                        Text("Saved so Find and Home can jump back to them.")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    if !store.ailments.isEmpty, let onFind {
                        Button("Find for these") {
                            onFind(store.ailments)
                        }
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Palette.primary)
                    }
                }
                FlowLayout(spacing: 8) {
                    ForEach(Conditions.catalog, id: \.self) { name in
                        SWChip(title: name, isOn: store.isSelected(name)) {
                            Task { await store.toggle(name) }
                        }
                        .disabled(store.isBusy)
                    }
                }
            }
        }
    }
}

#Preview("Ailments") {
    SavedAilmentsCard()
        .padding()
        .environment(SavedAilmentsStore.preview(["Anxiety", "ADHD"]))
}
