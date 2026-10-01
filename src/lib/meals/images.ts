/**
 * Picture for a meal, picked from its name. Pure and client-safe.
 *
 * The sheet has no picture column on purpose: one drawing per kind of dish
 * (rice bowl, tomato pasta, oats...) lives in `public/food/`, and a meal gets
 * the first kind its name matches. A meal added to the sheet tomorrow gets a
 * picture without anyone doing anything. To swap the drawings for photos,
 * replace the files and change IMAGE_EXT.
 */

const IMAGE_DIR = "/food";
const IMAGE_EXT = "svg";

export const DISH_IMAGES = [
  "baked-oats", "cheesecake-bowl", "chili", "cottage-bowl", "creamy-pasta", "curry-rice", "eggs-toast",
  "french-toast", "fried-rice", "glazed-rice", "ham-bread", "lasagne", "mexican-bowl", "oats-bowl",
  "omelette", "overnight-oats", "pancakes", "pesto-pasta", "potato-plate", "pudding", "rice-bowl", "salad",
  "sandwich", "shake", "shawarma", "skyr-bowl", "tomato-pasta", "tortilla-pizza", "tuna-bread", "tuna-rice",
  "twarog-bowl", "wrap",
] as const;
export type DishImage = (typeof DISH_IMAGES)[number];

/** First match wins, so the specific dishes come before the broad ones. */
const RULES: [RegExp, DishImage][] = [
  [/lasagne|lazania/, "lasagne"],
  [/pizza/, "tortilla-pizza"],
  [/pancake|nalesnik|placki/, "pancakes"],
  [/french toast|tosty francuskie/, "french-toast"],
  [/omelet|omlet/, "omelette"],
  [/overnight|chia/, "overnight-oats"],
  [/baked oats/, "baked-oats"],
  [/fried rice/, "fried-rice"],
  [/salad|salat/, "salad"],
  [/wrap|tortill|quesadilla|breakfast burrito/, "wrap"],
  [/potato|ziemniak|hash/, "potato-plate"],
  [/curry|tikka|satay/, "curry-rice"],
  [/teriyaki|sweet chilli|honey garlic|bbq/, "glazed-rice"],
  [/burrito|taco|fajita|mexican/, "mexican-bowl"],
  [/chili/, "chili"],
  [/gyros|shawarma|kebab/, "shawarma"],
  [/pesto/, "pesto-pasta"],
  [/mac ?(&|and) ?cheese|parmesan pasta|stroganoff|alfredo|carbonara/, "creamy-pasta"],
  [/pasta|makaron|bolognese|orzo|spaghetti/, "tomato-pasta"],
  [/(tuna|tunczyk).*(rice|ryz)|(rice|ryz).*(tuna|tunczyk)/, "tuna-rice"],
  [/tuna|tunczyk/, "tuna-bread"],
  [/jajk|jaj |egg|scrambled|jajecznica/, "eggs-toast"],
  [/cheesecake|tiramisu/, "cheesecake-bowl"],
  [/pudding|budyn/, "pudding"],
  [/cottage|serek wiejski/, "cottage-bowl"],
  [/twarog/, "twarog-bowl"],
  [/skyr|yogurt|jogurt|protein bomb/, "skyr-bowl"],
  [/oats|owsian|porridge|platki/, "oats-bowl"],
  [/whey|shake|koktajl/, "shake"],
  [/szynk|ham|mozzarella|turkey sandwich|indyk/, "ham-bread"],
  [/sandwich|kanapk|pieczywo|chleb|bread|toast|bulk/, "sandwich"],
  [/rice|ryz/, "rice-bowl"],
];

/** For names that match nothing: something typical of the sheet's category. */
const CATEGORY_FALLBACK: [RegExp, DishImage][] = [
  [/sniadanie/, "oats-bowl"],
  [/kolacja/, "sandwich"],
  [/przekask|lekki/, "skyr-bowl"],
  [/awaryjne/, "sandwich"],
];

/** Lowercase ASCII: "Tuńczyk + ryż" -> "tunczyk + ryz". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function dishImageFor(name: string, category = ""): DishImage {
  const normalizedName = normalize(name);
  for (const [pattern, image] of RULES) if (pattern.test(normalizedName)) return image;
  const normalizedCategory = normalize(category);
  for (const [pattern, image] of CATEGORY_FALLBACK) if (pattern.test(normalizedCategory)) return image;
  return "rice-bowl";
}

export function mealImageSrc(name: string, category = ""): string {
  return `${IMAGE_DIR}/${dishImageFor(name, category)}.${IMAGE_EXT}`;
}
