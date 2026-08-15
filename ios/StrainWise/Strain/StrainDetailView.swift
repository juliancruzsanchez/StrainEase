import SwiftUI

struct StrainDetailView: View {
    @Environment(\.strainAPI) private var api
    @State private var profile: StrainProfile
    @State private var isHydrating = false
    @Environment(SavedStrainsStore.self) private var saved
    @Environment(RecentlyViewedStore.self) private var recents

    init(profile: StrainProfile) {
        _profile = State(initialValue: profile)
    }

    private var score: Int { StrainMeaning.dayNightScore(profile) }
    private var isLiked: Bool { saved.isSaved(profile.slug) }

    var body: some View {
        ZStack {
            MeshBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    if let description = profile.description, !description.isEmpty {
                        SWCard {
                            Text(description)
                                .font(.system(size: 16))
                                .foregroundStyle(Palette.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    dayNight
                    if let uses = profile.medicalUses, !uses.isEmpty {
                        chipSection("Reported uses", items: uses)
                    }
                    if let effects = profile.effects, !effects.isEmpty {
                        effectsSection(effects)
                    }
                    if let terpenes = profile.terpenes, !terpenes.isEmpty {
                        terpenesSection(terpenes)
                    }
                    if let sides = profile.sideEffects, !sides.isEmpty {
                        chipSection("Watch for", items: sides)
                    }
                    TriedNotesView(profile: profile)
                    CommunityVoicesSection(profile: profile, isHydrating: isHydrating)
                    if !profile.inKnowledgeBase && !isHydrating {
                        missing
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 48)
            }
        }
        .navigationTitle(profile.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await saved.toggle(profile) }
                } label: {
                    Image(systemName: isLiked ? "heart.fill" : "heart")
                        .foregroundStyle(isLiked ? Palette.primary : Palette.mutedForeground)
                        .symbolEffect(.bounce, value: isLiked)
                }
                .accessibilityLabel(isLiked ? "Remove from liked strains" : "Add to liked strains")
                .disabled(saved.isBusy)
                .sensoryFeedback(.selection, trigger: isLiked)
            }
        }
        .task(id: profile.slug) {
            recents.record(profile)
            await hydrate()
        }
    }

    private func hydrate() async {
        isHydrating = profile.isPartial
        defer { isHydrating = false }
        do {
            guard let full = try await api.search(name: profile.name) else { return }
            profile = full
            recents.record(full)
        } catch {
            // Keep the stub / cached profile if Leafly is unreachable.
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            if profile.imageUrl != nil {
                StrainPhoto(
                    urlString: profile.imageUrl,
                    type: profile.type,
                    height: 248,
                    cornerRadius: 20
                )
            }
            HStack(spacing: 8) {
                TypeBadge(type: profile.type)
                if !profile.inKnowledgeBase {
                    Text("AI researched")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Palette.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Palette.accent, in: Capsule())
                }
            }
            Text(profile.name)
                .font(.system(.largeTitle, design: .serif))
                .foregroundStyle(Palette.foreground)
            if !profile.subtitle.isEmpty {
                Text(profile.subtitle)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Palette.mutedForeground)
            }
            if let lineage = profile.lineage, !lineage.isEmpty {
                Text(lineage)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.mutedForeground)
            }
        }
    }

    private var dayNight: some View {
        SWCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Day", systemImage: "sun.max")
                    Spacer()
                    Label("Night", systemImage: "moon")
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Palette.mutedForeground)
                .labelStyle(.titleAndIcon)
                .symbolRenderingMode(.hierarchical)

                GeometryReader { geo in
                    let x = geo.size.width * CGFloat(100 - score) / 100
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color(red: 0.49, green: 0.76, blue: 0.92),
                                        Palette.primary,
                                        Color(red: 0.12, green: 0.14, blue: 0.32),
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(height: 8)
                        Circle()
                            .fill(Palette.card)
                            .overlay(Circle().strokeBorder(Palette.foreground.opacity(0.35), lineWidth: 1.5))
                            .frame(width: 16, height: 16)
                            .offset(x: max(0, min(geo.size.width - 16, x - 8)))
                    }
                }
                .frame(height: 16)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Day to night rating")
                .accessibilityValue("\(score) out of 100 toward daytime")

                Text(StrainMeaning.dayNightLabel(score))
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.mutedForeground)
            }
        }
    }

    private func chipSection(_ title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title)
            FlowLayout(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Text(item)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Palette.foreground)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Palette.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(Palette.border, lineWidth: 1))
                }
            }
        }
    }

    private func effectsSection(_ effects: [StrainEffect]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Effects")
            SWCard {
                VStack(spacing: 12) {
                    ForEach(effects, id: \.name) { effect in
                        HStack {
                            Text(effect.name)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Palette.foreground)
                            Spacer()
                            IntensityBar(value: effect.intensity)
                        }
                    }
                }
            }
        }
    }

    private func terpenesSection(_ terpenes: [Terpene]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Terpenes")
            VStack(spacing: 10) {
                ForEach(terpenes, id: \.name) { terpene in
                    SWCard {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(terpene.name)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Palette.foreground)
                            if let meaning = StrainMeaning.terpeneMeaning(terpene.name) {
                                Text(meaning)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.mutedForeground)
                                    .fixedSize(horizontal: false, vertical: true)
                            } else if !terpene.profile.isEmpty {
                                Text(terpene.profile)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.mutedForeground)
                            }
                        }
                    }
                }
            }
        }
    }

    private var missing: some View {
        SWCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Not in the knowledge base")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.foreground)
                Text("Leafly and Weedmaps didn’t return a full profile. The AI still researched this name from public sources — treat numbers as commonly reported, not lab-verified.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct CommunityVoicesSection: View {
    let profile: StrainProfile
    var isHydrating = false

    private var quotes: [CommunityNote] { profile.quoteNotes }
    private var rating: (stars: Double, count: Int?)? { profile.resolvedLeaflyRating }

    var body: some View {
        if rating != nil || !quotes.isEmpty || isHydrating {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Community voices")
                if let rating {
                    LeaflyRatingCard(stars: rating.stars, count: rating.count)
                }
                if isHydrating && quotes.isEmpty {
                    SWCard {
                        HStack(spacing: 10) {
                            ProgressView()
                                .tint(Palette.primary)
                            Text("Pulling Leafly reviews and Reddit comments…")
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.mutedForeground)
                        }
                    }
                }
                ForEach(quotes) { note in
                    SWCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(note.source.uppercased())
                                .font(.system(size: 10, weight: .semibold))
                                .tracking(1.2)
                                .foregroundStyle(Palette.primary)
                            Text("“\(note.text)”")
                                .font(.system(.body, design: .serif))
                                .foregroundStyle(Palette.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }
}

private struct LeaflyRatingCard: View {
    let stars: Double
    let count: Int?

    var body: some View {
        SWCard {
            HStack(spacing: 14) {
                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { index in
                        let fill = min(1, max(0, stars - Double(index)))
                        Image(systemName: fill >= 0.75 ? "star.fill" : fill >= 0.25 ? "star.leadinghalf.filled" : "star")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.primary)
                    }
                }
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(stars, format: .number.precision(.fractionLength(1)))
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .foregroundStyle(Palette.foreground)
                    Text(countLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Palette.mutedForeground)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityLabel)
        }
    }

    private var countLabel: String {
        if let count {
            return "\(count.formatted()) Leafly reviews"
        }
        return "Average Leafly rating"
    }

    private var accessibilityLabel: String {
        let rating = String(format: "%.1f", stars)
        if let count {
            return "Leafly rating \(rating) from \(count.formatted()) reviews"
        }
        return "Leafly rating \(rating)"
    }
}

#Preview("Granddaddy Purple") {
    NavigationStack {
        StrainDetailView(profile: .sampleGDP)
    }
    .environment(\.strainAPI, PreviewStrainAPI())
    .environment(SavedStrainsStore.preview())
    .environment(RecentlyViewedStore.preview())
}

#Preview("Liked · Dark") {
    NavigationStack {
        StrainDetailView(profile: .sampleGDP)
    }
    .environment(\.strainAPI, PreviewStrainAPI())
    .environment(SavedStrainsStore.preview(["granddaddy-purple"]))
    .environment(RecentlyViewedStore.preview())
    .preferredColorScheme(.dark)
}
