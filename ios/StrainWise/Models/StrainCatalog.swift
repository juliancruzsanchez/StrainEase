import Foundation

enum StrainCatalog {
    private struct DirectoryEntry: Decodable {
        var name: String
        var type: StrainType
        var thc: String
        var uses: [String]
        var imageUrl: String?
    }

    /// Curated set so every type / ailment rail still has 6+ strains.
    private static let curated: [StrainProfile] = [
        entry("Blue Dream", .hybrid, "17–24%", ["Chronic pain", "Depression", "Stress", "Fatigue", "Inflammation", "Arthritis"]),
        entry("Granddaddy Purple", .indica, "17–23%", ["Insomnia", "Chronic pain", "Muscle spasm", "Stress", "PTSD", "Anxiety"]),
        entry("Sour Diesel", .sativa, "19–24%", ["ADHD", "Stress", "Depression", "Chronic pain", "Fatigue", "Migraine"]),
        entry("Jack Herer", .sativa, "18–23%", ["ADHD", "Fatigue", "Depression", "Stress", "Inflammation", "Migraine"]),
        entry("Gelato", .hybrid, "20–25%", ["Stress", "Anxiety", "Depression", "PTSD", "Nausea & appetite"]),
        entry("Northern Lights", .indica, "16–21%", ["Insomnia", "Chronic pain", "Stress", "Anxiety", "PTSD", "Inflammation"]),
        entry("OG Kush", .hybrid, "19–26%", ["Chronic pain", "Stress", "Nausea & appetite", "Migraine", "Arthritis", "Muscle spasm"]),
        entry("Green Crack", .sativa, "15–25%", ["ADHD", "Fatigue", "Stress", "Depression", "Migraine", "Anxiety"]),
        entry("Bubba Kush", .indica, "14–22%", ["Insomnia", "Chronic pain", "Muscle spasm", "Arthritis", "PTSD", "Nausea & appetite"]),
        entry("Wedding Cake", .hybrid, "20–25%", ["Anxiety", "Stress", "Depression", "PTSD", "Inflammation"]),
        entry("Durban Poison", .sativa, "15–25%", ["ADHD", "Fatigue", "Depression", "Stress", "Migraine"]),
        entry("Purple Punch", .indica, "18–20%", ["Insomnia", "Anxiety", "Nausea & appetite", "Stress", "Arthritis"]),
        entry("Gorilla Glue", .hybrid, "20–28%", ["Chronic pain", "Stress", "Insomnia", "Inflammation"]),
        entry("Super Lemon Haze", .sativa, "17–25%", ["ADHD", "Fatigue", "Depression", "Stress"]),
        entry("9 Pound Hammer", .indica, "18–23%", ["Insomnia", "Chronic pain", "Muscle spasm", "Arthritis"]),
        entry("Girl Scout Cookies", .hybrid, "17–28%", ["Chronic pain", "Nausea & appetite", "Stress", "Anxiety"]),
        entry("Strawberry Cough", .sativa, "15–22%", ["ADHD", "Fatigue", "Stress", "Anxiety"]),
        entry("Hindu Kush", .indica, "15–20%", ["Chronic pain", "Insomnia", "Inflammation", "Arthritis", "Muscle spasm"]),
        entry("White Widow", .hybrid, "18–25%", ["Stress", "Depression", "Inflammation", "Migraine", "Arthritis"]),
        entry("Pineapple Express", .hybrid, "15–25%", ["ADHD", "Depression", "Fatigue", "Stress"]),
        entry("GMO Cookies", .indica, "20–28%", ["Insomnia", "Nausea & appetite", "Chronic pain", "Muscle spasm"]),
        entry("Super Silver Haze", .sativa, "16–23%", ["ADHD", "Fatigue", "Depression", "Stress"]),
        entry("Skywalker OG", .indica, "18–26%", ["Insomnia", "Chronic pain", "PTSD", "Stress"]),
        entry("Tangie", .sativa, "17–22%", ["ADHD", "Fatigue", "Depression", "Stress"]),
    ]

    /// Leafly + Weedmaps dump (same JSON as the web directory).
    private static let directory: [StrainProfile] = loadDirectory()

    /// Curated rows win on medical uses when a name also appears in the dump.
    static let all: [StrainProfile] = unique(curated + directory).map(applyPhoto)

    static func merge(_ live: [StrainProfile], preferringType type: StrainType? = nil) -> [StrainProfile] {
        let extras = all.filter { catalog in
            if let type, catalog.type != type { return false }
            return !live.contains { $0.slug == catalog.slug }
        }
        let head = type == nil ? live : live.filter { $0.type == type }
        return unique(head + extras).map(fillMissing)
    }

    static func matching(ailment: String, live: [StrainProfile]) -> [StrainProfile] {
        let combined = unique(live + all).map(fillMissing)
        let hits = combined.filter { matches($0, ailment: ailment) }
        return hits.isEmpty ? Array(combined.prefix(8)) : hits
    }

    static func unique(_ profiles: [StrainProfile]) -> [StrainProfile] {
        var seen: [String: StrainProfile] = [:]
        var order: [String] = []
        for profile in profiles where !profile.name.isEmpty {
            let slug = profile.slug
            if var existing = seen[slug] {
                if (existing.imageUrl == nil || existing.imageUrl?.isEmpty == true),
                   let imageUrl = profile.imageUrl, !imageUrl.isEmpty {
                    existing.imageUrl = imageUrl
                }
                if (existing.medicalUses == nil || existing.medicalUses?.isEmpty == true),
                   let uses = profile.medicalUses, !uses.isEmpty {
                    existing.medicalUses = uses
                }
                if existing.type == nil { existing.type = profile.type }
                if existing.thcRange == nil { existing.thcRange = profile.thcRange }
                seen[slug] = existing
            } else {
                seen[slug] = profile
                order.append(slug)
            }
        }
        return order.compactMap { seen[$0] }
    }

    static func matches(_ profile: StrainProfile, ailment: String) -> Bool {
        let keys = Conditions.matchKeys(for: ailment)
        return profile.medicalUses?.contains { use in
            keys.contains { $0.caseInsensitiveCompare(use) == .orderedSame }
        } == true
    }

    private static let photos: [String: String] = [
        "blue-dream": "https://images.leafly.com/flower-images/blue-dream.png",
        "granddaddy-purple": "https://images.leafly.com/flower-images/granddaddy-purple.png",
        "sour-diesel": "https://leafly-public.imgix.net/strains/photos/5SPDG4T4TcSO8PgLgWHO_SourDiesel_AdobeStock_171888473.jpg",
        "jack-herer": "https://images.leafly.com/flower-images/jack-herer.jpg",
        "gelato": "https://images.leafly.com/flower-images/gelato.jpg",
        "northern-lights": "https://images.leafly.com/flower-images/northern-lights.png",
        "og-kush": "https://images.leafly.com/flower-images/og-kush.png",
        "green-crack": "https://images.leafly.com/flower-images/green-crack.png",
        "bubba-kush": "https://images.leafly.com/flower-images/bubba-kush.png",
        "wedding-cake": "https://leafly-public.imgix.net/strains/photos/m2y50HYRBu0dHY4JSdSx_wedding-cake_jman.jpg",
        "durban-poison": "https://images.leafly.com/flower-images/durban-poison.jpg",
        "purple-punch": "https://images.leafly.com/flower-images/purple-punch-fixed.jpg",
        "gorilla-glue": "https://images.leafly.com/flower-images/gg-4.jpg",
        "super-lemon-haze": "https://leafly-public.imgix.net/strains/photos/QRio3lTnO1PsVFx8Sxw1_super-lemon-haze_jman.jpg",
        "9-pound-hammer": "https://leafly-public.imgix.net/strains/photos/dN680700Rbqf10ZWl54R_9-pound-hammer_jman.jpg",
        "girl-scout-cookies": "https://images.leafly.com/flower-images/gsc.png",
        "strawberry-cough": "https://images.leafly.com/flower-images/strawberry-cough.png",
        "hindu-kush": "https://images.leafly.com/flower-images/defaults/generic/strain-13.png",
        "white-widow": "https://images.leafly.com/flower-images/white-widow.png",
        "pineapple-express": "https://images.leafly.com/flower-images/pineapple-express.png",
        "gmo-cookies": "https://images.leafly.com/flower-images/defaults/red-orange-amber/strain-2.png",
        "super-silver-haze": "https://images.leafly.com/flower-images/super-silver-haze.png",
        "skywalker-og": "https://images.leafly.com/flower-images/defaults/long-fluffy-wispy/strain-2.png",
        "tangie": "https://leafly-public.imgix.net/strains/photos/8wTMziz0RQaJqNE4juPn_Tangie.png",
    ]

    private static func applyPhoto(_ profile: StrainProfile) -> StrainProfile {
        var next = profile
        if next.imageUrl == nil || next.imageUrl?.isEmpty == true {
            next.imageUrl = photos[profile.slug]
        }
        return next
    }

    private static func fillMissing(_ profile: StrainProfile) -> StrainProfile {
        var next = applyPhoto(profile)
        if next.medicalUses == nil || next.medicalUses?.isEmpty == true,
           let uses = all.first(where: { $0.slug == profile.slug })?.medicalUses {
            next.medicalUses = uses
        }
        return next
    }

    private static func entry(
        _ name: String,
        _ type: StrainType,
        _ thc: String,
        _ uses: [String],
        imageUrl: String? = nil
    ) -> StrainProfile {
        StrainProfile(
            name: name,
            inKnowledgeBase: true,
            type: type,
            thcRange: thc,
            medicalUses: uses,
            imageUrl: imageUrl ?? photos[StrainProfile(name: name, inKnowledgeBase: true).slug]
        )
    }

    private static func loadDirectory() -> [StrainProfile] {
        let url = Bundle.main.url(forResource: "strain-directory", withExtension: "json")
            ?? Bundle(for: BundleToken.self).url(forResource: "strain-directory", withExtension: "json")
        guard let url,
              let data = try? Data(contentsOf: url),
              let rows = try? JSONDecoder().decode([DirectoryEntry].self, from: data)
        else { return [] }
        return rows.compactMap { row in
            let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { return nil }
            return StrainProfile(
                name: name,
                inKnowledgeBase: true,
                type: row.type,
                thcRange: row.thc.isEmpty ? nil : row.thc,
                medicalUses: row.uses.isEmpty ? nil : row.uses,
                imageUrl: row.imageUrl
            )
        }
    }
}

private final class BundleToken {}
