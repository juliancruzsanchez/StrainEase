import SwiftUI

struct StrainGridView: View {
    let title: String
    let strains: [StrainProfile]
    var onSelect: (StrainProfile) -> Void

    @State private var query = ""

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    private var visible: [StrainProfile] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return strains }
        return strains.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        ZStack {
            MeshBackground()
            ScrollView {
                if strains.isEmpty {
                    ContentUnavailableView(
                        "No strains yet",
                        systemImage: "leaf",
                        description: Text("Check back after you browse a little more.")
                    )
                    .padding(.top, 80)
                } else {
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(visible) { profile in
                            Button {
                                onSelect(profile)
                            } label: {
                                StrainPoster(profile: profile)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .top, spacing: 0) {
            if strains.count > 8 {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(strains.count) strains")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Palette.mutedForeground)
                    TextField("Search this list…", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Palette.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(Palette.border, lineWidth: 1))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(Palette.background.opacity(0.94))
            }
        }
    }
}
