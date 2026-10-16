/**
 * The 50 expertise types FindMit supports, with the workshop background
 * each one shows behind the Find Talent feed and its auto-suggested skills.
 */
export type BgKey =
  | "welding"
  | "plumbing"
  | "electrical"
  | "construction"
  | "tailoring"
  | "hair-salon"
  | "makeup"
  | "design-studio"
  | "camera-studio"
  | "kitchen"
  | "cleaning"
  | "garage"
  | "shop-office"
  | "classroom"
  | "repair-bench";

export const BG_SOURCES: Record<BgKey, string> = {
  welding: "/expertise-bgs/welding-bg.jpg",
  plumbing: "/expertise-bgs/plumbing-bg.jpg",
  electrical: "/expertise-bgs/electrical-bg.jpg",
  construction: "/expertise-bgs/construction-bg.jpg",
  tailoring: "/expertise-bgs/tailoring-bg.jpg",
  "hair-salon": "/expertise-bgs/hair-salon-bg.jpg",
  makeup: "/expertise-bgs/makeup-bg.jpg",
  "design-studio": "/expertise-bgs/design-studio-bg.jpg",
  "camera-studio": "/expertise-bgs/camera-studio-bg.jpg",
  kitchen: "/expertise-bgs/kitchen-bg.jpg",
  cleaning: "/expertise-bgs/cleaning-bg.jpg",
  garage: "/expertise-bgs/garage-bg.jpg",
  "shop-office": "/expertise-bgs/shop-office-bg.jpg",
  classroom: "/expertise-bgs/classroom-bg.jpg",
  "repair-bench": "/expertise-bgs/repair-bench-bg.jpg",
};

/** Every workshop image, cycled behind the Find Jobs and Find Talent feeds. */
export const SLIDESHOW_BGS = Object.values(BG_SOURCES);

export interface Expertise {
  /** Stored value on the talent profile. */
  name: string;
  /** Lucide icon name rendered on the picker and the card. */
  icon: string;
  bg: BgKey;
  skills: string[];
}

export const EXPERTISE_LIST: Expertise[] = [
  { name: "Plumbing", icon: "Wrench", bg: "plumbing", skills: ["Pipe fitting", "Leak repair", "Water closet", "Drainage", "Pumps"] },
  { name: "Tiling", icon: "Grid3x3", bg: "plumbing", skills: ["Floor tiling", "Wall tiling", "Grouting", "Screeding", "Cutting"] },
  { name: "Electrical", icon: "Zap", bg: "electrical", skills: ["House wiring", "Sockets", "Lighting", "Fault finding", "Distribution board"] },
  { name: "AC Repair", icon: "Wind", bg: "electrical", skills: ["Split unit install", "Gas refill", "Servicing", "Fault finding", "Ducting"] },
  { name: "Solar Installation", icon: "SunMedium", bg: "electrical", skills: ["Panel mounting", "Inverters", "Batteries", "Wiring", "Maintenance"] },
  { name: "Welding", icon: "Flame", bg: "welding", skills: ["Arc welding", "Gates", "Burglar proof", "Metal doors", "Grinding"] },
  { name: "Fabrication", icon: "Hammer", bg: "welding", skills: ["Steel works", "Roofing frames", "Trusses", "Cutting", "Finishing"] },
  { name: "Mason", icon: "BrickWall", bg: "construction", skills: ["Block laying", "Plastering", "Foundation", "Concrete", "Levelling"] },
  { name: "Builder", icon: "Building2", bg: "construction", skills: ["Site supervision", "Concrete", "Block work", "Estimating", "Finishing"] },
  { name: "Carpentry", icon: "Hammer", bg: "construction", skills: ["Roofing", "Doors", "Furniture", "Ceiling", "Formwork"] },
  { name: "Painting", icon: "PaintRoller", bg: "construction", skills: ["Emulsion", "Spraying", "Texture", "Screeding", "Finishing"] },
  { name: "POP Ceiling", icon: "LayoutPanelTop", bg: "construction", skills: ["POP design", "Gypsum", "Cornice", "Lighting slots", "Finishing"] },
  { name: "Aluminium Works", icon: "Frame", bg: "construction", skills: ["Windows", "Sliding doors", "Partitions", "Glazing", "Fixing"] },
  { name: "Tailoring", icon: "Scissors", bg: "tailoring", skills: ["Kaba & slit", "Suits", "Alterations", "Measurements", "Embroidery"] },
  { name: "Fashion Design", icon: "Shirt", bg: "tailoring", skills: ["Pattern making", "Styling", "Kente", "Bridal", "Sketching"] },
  { name: "Shoe Making", icon: "Footprints", bg: "tailoring", skills: ["Sandals", "Repairs", "Leather cutting", "Sole fitting", "Finishing"] },
  { name: "Leather Works", icon: "Briefcase", bg: "tailoring", skills: ["Bags", "Belts", "Stitching", "Dyeing", "Repairs"] },
  { name: "Hairdressing", icon: "Sparkles", bg: "hair-salon", skills: ["Styling", "Relaxing", "Treatment", "Colouring", "Blow dry"] },
  { name: "Braiding", icon: "Sparkles", bg: "hair-salon", skills: ["Ghana weaving", "Box braids", "Twists", "Cornrows", "Locs"] },
  { name: "Barbering", icon: "Scissors", bg: "hair-salon", skills: ["Fades", "Beard trim", "Line up", "Kids cuts", "Shaving"] },
  { name: "Wig Making", icon: "Sparkles", bg: "hair-salon", skills: ["Ventilating", "Closures", "Frontals", "Revamp", "Installation"] },
  { name: "Makeup Artistry", icon: "Palette", bg: "makeup", skills: ["Bridal", "Soft glam", "Lashes", "Skin prep", "Editorial"] },
  { name: "Nail Technician", icon: "Hand", bg: "makeup", skills: ["Acrylics", "Gel polish", "Pedicure", "Nail art", "Refills"] },
  { name: "Spa & Massage", icon: "Flower2", bg: "makeup", skills: ["Deep tissue", "Facials", "Waxing", "Body scrub", "Relaxation"] },
  { name: "Graphic Design", icon: "PenTool", bg: "design-studio", skills: ["Flyers", "Logos", "Branding", "Photoshop", "Illustrator"] },
  { name: "Printing", icon: "Printer", bg: "design-studio", skills: ["Large format", "T-shirt press", "Banners", "Business cards", "Finishing"] },
  { name: "Web Development", icon: "Code", bg: "design-studio", skills: ["Websites", "E-commerce", "Hosting", "SEO", "Maintenance"] },
  { name: "Social Media Management", icon: "Megaphone", bg: "design-studio", skills: ["Content", "Ads", "Copywriting", "Analytics", "Scheduling"] },
  { name: "Photography", icon: "Camera", bg: "camera-studio", skills: ["Events", "Portrait", "Studio lighting", "Retouching", "Product"] },
  { name: "Videography", icon: "Video", bg: "camera-studio", skills: ["Weddings", "Editing", "Colour grading", "Drone", "Sound"] },
  { name: "DJ & Sound", icon: "Music", bg: "camera-studio", skills: ["Mixing", "Events", "PA setup", "Lighting", "MC"] },
  { name: "Cooking", icon: "ChefHat", bg: "kitchen", skills: ["Local dishes", "Continental", "Meal prep", "Hygiene", "Menu planning"] },
  { name: "Baking", icon: "CakeSlice", bg: "kitchen", skills: ["Cakes", "Pastries", "Icing", "Bread", "Custom orders"] },
  { name: "Catering", icon: "Utensils", bg: "kitchen", skills: ["Events", "Bulk cooking", "Service staff", "Costing", "Packaging"] },
  { name: "Bartending", icon: "Wine", bg: "kitchen", skills: ["Cocktails", "Events", "Stock control", "Service", "Hygiene"] },
  { name: "Cleaning", icon: "SprayCan", bg: "cleaning", skills: ["Deep cleaning", "Office cleaning", "Post construction", "Sanitising", "Fumigation"] },
  { name: "Laundry", icon: "Shirt", bg: "cleaning", skills: ["Washing", "Ironing", "Dry cleaning", "Pickup", "Folding"] },
  { name: "House Help", icon: "House", bg: "cleaning", skills: ["Childcare", "Cooking", "Cleaning", "Laundry", "Errands"] },
  { name: "Driving", icon: "Car", bg: "garage", skills: ["Private driver", "Long distance", "Defensive driving", "Licence C", "Deliveries"] },
  { name: "Mechanic", icon: "Wrench", bg: "garage", skills: ["Engine repair", "Diagnostics", "Suspension", "Servicing", "Electricals"] },
  { name: "Auto Electrician", icon: "BatteryCharging", bg: "garage", skills: ["Wiring", "Alternators", "Alarms", "Diagnostics", "Lighting"] },
  { name: "Delivery Rider", icon: "Bike", bg: "garage", skills: ["Dispatch", "Route planning", "Customer care", "Cash handling", "Speed"] },
  { name: "Sales", icon: "ShoppingBag", bg: "shop-office", skills: ["Closing", "Merchandising", "Customer care", "Targets", "Field sales"] },
  { name: "Cashier", icon: "Calculator", bg: "shop-office", skills: ["POS", "Cash handling", "Reconciliation", "Customer care", "Records"] },
  { name: "Waiter / Waitress", icon: "Utensils", bg: "shop-office", skills: ["Table service", "Orders", "Upselling", "Hygiene", "Teamwork"] },
  { name: "Security", icon: "ShieldCheck", bg: "shop-office", skills: ["Access control", "Patrol", "CCTV", "Reporting", "Night shift"] },
  { name: "Secretary", icon: "FileText", bg: "shop-office", skills: ["Typing", "Filing", "MS Office", "Scheduling", "Front desk"] },
  { name: "Teaching", icon: "GraduationCap", bg: "classroom", skills: ["Lesson planning", "Home tutoring", "Maths", "English", "Exam prep"] },
  { name: "Phone Repair", icon: "Smartphone", bg: "repair-bench", skills: ["Screen replacement", "Software", "Battery", "Charging port", "Unlocking"] },
  { name: "Laptop Repair", icon: "Laptop", bg: "repair-bench", skills: ["Windows install", "Hardware", "Data recovery", "Upgrades", "Virus removal"] },
];

const BY_NAME = new Map(EXPERTISE_LIST.map((item) => [item.name.toLowerCase(), item]));

export function findExpertise(name: string | null | undefined): Expertise | null {
  if (!name) return null;
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/** Resolves the workshop background for any expertise, falling back to welding. */
export function getBg(expertise: string | null | undefined): string {
  const match = findExpertise(expertise);
  return match ? BG_SOURCES[match.bg] : BG_SOURCES.welding;
}

export function suggestedSkills(expertise: string | null | undefined): string[] {
  return findExpertise(expertise)?.skills ?? [];
}

export const GHANA_REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Western North",
  "Central",
  "Eastern",
  "Volta",
  "Oti",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
  "Bono",
  "Bono East",
  "Ahafo",
];

export const GHANA_TOWNS: Record<string, string[]> = {
  "Greater Accra": ["Accra", "Tema", "Madina", "Ashiaman", "Adenta", "Kasoa", "Teshie", "Dansoman", "Spintex", "Amasaman"],
  Ashanti: ["Kumasi", "Obuasi", "Ejisu", "Konongo", "Mampong", "Bekwai", "Offinso", "Asokwa"],
  Western: ["Takoradi", "Sekondi", "Tarkwa", "Axim", "Agona Nkwanta"],
  "Western North": ["Sefwi Wiawso", "Bibiani", "Juaboso", "Enchi"],
  Central: ["Cape Coast", "Winneba", "Swedru", "Elmina", "Mankessim", "Dunkwa"],
  Eastern: ["Koforidua", "Nkawkaw", "Akosombo", "Suhum", "Nsawam", "Akim Oda"],
  Volta: ["Ho", "Keta", "Aflao", "Hohoe", "Sogakope"],
  Oti: ["Dambai", "Jasikan", "Kadjebi", "Nkwanta"],
  Northern: ["Tamale", "Yendi", "Savelugu", "Bimbilla"],
  Savannah: ["Damongo", "Bole", "Salaga", "Sawla"],
  "North East": ["Nalerigu", "Walewale", "Gambaga"],
  "Upper East": ["Bolgatanga", "Navrongo", "Bawku", "Zebilla"],
  "Upper West": ["Wa", "Lawra", "Tumu", "Jirapa"],
  Bono: ["Sunyani", "Berekum", "Dormaa Ahenkro", "Wenchi"],
  "Bono East": ["Techiman", "Kintampo", "Atebubu", "Nkoranza"],
  Ahafo: ["Goaso", "Bechem", "Hwidiem", "Kenyasi"],
};
