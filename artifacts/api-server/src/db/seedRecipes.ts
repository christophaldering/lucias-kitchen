import { db } from "@workspace/db";
import { recipesTable, recipeIngredientsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const RECIPES_DATA = [
  {
    id: "1", title: "Spaghetti mit Lachs und Champignons", servings: 4,
    prepTime: "ca. 20 Minuten", totalTime: "ca. 20 Minuten", difficulty: "simpel",
    category: "Pasta", rating: "sehr lecker", cookedCount: 5, lastCooked: "19.10.21",
    source: "Toshibabe / Chefkoch",
    steps: ["Die Spaghetti in reichlich Wasser al dente kochen.", "Die Champignons putzen und in Scheiben schneiden.", "Den Lachs in Streifen schneiden und in etwas Öl vorsichtig anbraten.", "Die Pilze dazugeben. Einige Minuten dünsten.", "Sahne dazugießen und kurz aufkochen lassen.", "Den Schmelzkäse in der Sauce auflösen – Schmelzkäse gesondert auflösen!!", "Mit Kräutern und Gewürzen abschmecken.", "Soße soll andicken."],
    notes: "Handschriftlich: 4 EL Lachs, 500g Champignons, 300ml Sahne, 300g Schmelzkäse. Soße soll andicken. Schmelzkäse gesondert auflösen!!",
    ingredients: [
      { amount: "500", unit: "g", name: "Nudeln (Spaghetti)", note: "oder 600g frische Nudeln / Kürbis-Nudeln" },
      { amount: "250", unit: "g", name: "Champignons", note: "400g TK oder Glas" },
      { amount: "200", unit: "g", name: "Lachs", note: "290g TK" },
      { amount: "200", unit: "ml", name: "Sahne", note: "7%" },
      { amount: "200", unit: "g", name: "Schmelzkäse mit Kräutern" },
      { amount: "1", unit: "TL", name: "Kerbel" },
      { amount: "", unit: "", name: "Salz und Pfeffer" },
    ],
  },
  {
    id: "2", title: "Paprika-Sahne-Hähnchen", servings: 4,
    prepTime: "ca. 20 Minuten", totalTime: "ca. 1 Stunde", difficulty: "normal",
    category: "Geflügel", kcalPerPortion: 445, source: "Sister / Chefkoch",
    steps: ["Hähnchenfilets waschen, trocken tupfen, mit Salz und Paprikapulver würzen und in einer Auflaufform dicht aneinanderlegen.", "Paprikaschoten waschen, entkernen, in schmale Streifen schneiden und auf den Filets verteilen.", "Zwiebel in halbe Ringe schneiden und in einer Pfanne in etwas Öl andünsten.", "Chilischote hinzuzupfen, Knoblauch pressen und hinzugeben.", "Paprikapulver und Tomatenmark hinzufügen, mit der Brühe ablöschen und kurz aufkochen lassen.", "Sahne und Schmand unter die Soße rühren und mit Salz abschmecken.", "Soße in die Auflaufform gießen – Fleisch und Paprikastreifen sollten ganz bedeckt sein.", "Geriebenen Käse gleichmäßig darauf verteilen.", "Im vorgeheizten Backofen bei 180°C Ober-/Unterhitze ca. 30 Minuten garen.", "Beilage: Bandnudeln oder Reis und Eisbergsalat mit Mandarinen und süß-saurer Vinaigrette."],
    notes: "",
    ingredients: [
      { amount: "4", unit: "", name: "Hähnchenbrust-Filets" }, { amount: "2", unit: "", name: "Paprikaschoten, rote" },
      { amount: "1", unit: "", name: "Paprikaschote, grüne" }, { amount: "1", unit: "", name: "Zwiebel" },
      { amount: "2", unit: "Zehen", name: "Knoblauch" }, { amount: "1", unit: "", name: "Chilischote, getrocknet" },
      { amount: "1", unit: "Becher", name: "Sahne" }, { amount: "1", unit: "Becher", name: "Schmand" },
      { amount: "1", unit: "TL", name: "Tomatenmark" }, { amount: "125", unit: "ml", name: "Gemüsebrühe" },
      { amount: "1", unit: "EL", name: "Paprikapulver, edelsüßes" }, { amount: "1", unit: "TL", name: "Paprikapulver, rosenscharfes" },
      { amount: "100", unit: "g", name: "Käse, geriebener" }, { amount: "", unit: "", name: "Öl, Salz, Paprikapulver" },
    ],
  },
  {
    id: "3", title: "Kabeljau in Senfsauce", servings: 4,
    prepTime: "ca. 30 Minuten", totalTime: "ca. 55 Minuten", difficulty: "normal",
    category: "Fisch", rating: "lecker", lastCooked: "06.04.25", kcalPerPortion: 372,
    source: "Tryumph800 / Chefkoch",
    steps: ["Den Backofen auf 220°C Ober-/Unterhitze vorheizen.", "Fischfilets kalt abspülen, trocken tupfen und mit Zitronensaft und Worcestersauce beträufeln. Eine feuerfeste Form mit etwas Butter ausfetten.", "Die Hälfte der restlichen Butter in einer kleinen Pfanne zergehen lassen, Mehl beigeben und hellgelb anschwitzen.", "Unter Rühren nach und nach erst die Milch beigeben, dann die Sahne, einige Minuten unter Umrühren leicht köcheln lassen.", "Die Sauce mit Senf, Salz, Pfeffer und Muskat abschmecken. Dill oder Petersilie beigeben.", "Fischfilets von beiden Seiten salzen, in die feuerfeste Form legen und das Paprikapulver darüber streuen.", "Die Sauce über die Fischfilets gießen und einige Butterflocken auf die Fische legen.", "Für ca. 15 Minuten in die Mitte des heißen Ofens geben.", "Dazu passt sehr gut Kartoffelpüree oder Reis."],
    notes: "Handschriftlich: Mit Kartoffeln + Erbsen in Möhren oder mit (gebratenen) Zuckerschoten",
    ingredients: [
      { amount: "800", unit: "g", name: "Kabeljau-Filets" }, { amount: "1", unit: "m.-große", name: "Zitrone, Saft davon" },
      { amount: "1", unit: "EL", name: "Mehl" }, { amount: "2", unit: "EL", name: "Butter" },
      { amount: "¼", unit: "Liter", name: "Milch" }, { amount: "¼", unit: "Liter", name: "Sahne", note: "oder mehr fettarme Sahne (Kaffeesahne)" },
      { amount: "2", unit: "EL", name: "Senf, mittelscharf", note: "1+" }, { amount: "½", unit: "TL", name: "Salz" },
      { amount: "1", unit: "Prise", name: "Pfeffer, schwarzer" }, { amount: "1", unit: "Prise", name: "Muskat" },
      { amount: "1", unit: "TL", name: "Paprikapulver, edelsüßes" }, { amount: "1", unit: "EL", name: "Dill, gehackter oder Petersilie" },
      { amount: "1", unit: "EL", name: "Worcestersauce" },
    ],
  },
  {
    id: "4", title: "Hähnchen mit Walnüssen und Früchten im Bratschlauch", servings: 3,
    prepTime: "ca. 30 Minuten", totalTime: "ca. 90 Minuten", difficulty: "simpel",
    category: "Geflügel", source: "TomTom / Chefkoch",
    steps: ["Das Hähnchen (ohne Innereien) waschen und trocken tupfen.", "Aus Olivenöl, Thymian, Paprikapulver, Pfeffer und Salz eine Marinade rühren, das Hähnchen damit dick einpinseln und zur Seite legen. Den Ofen auf 200°C vorheizen.", "Das Obst schälen, entkernen und in kleine Stücke teilen.", "Mit dem Fruchtsirup, dem Honig und dem Cognac ungefähr eine halbe Tasse Soße zusammenrühren.", "Eine Pfanne mit Olivenöl ausstreichen, erhitzen und die geschälten Walnüsse mit den Rosinen und dem Obst erhitzen.", "Mit der 'Sirupsoße' ablöschen und unter Hitze einrühren (evtl. etwas Wasser zugeben). Mit der Hälfte aus der Pfanne das Hähnchen füllen.", "Den Bratschlauch vorbereiten (Naht nach oben und auf das kalte Rost legen) und das Hähnchen hineinlegen.", "Die restliche Menge aus der Pfanne um das Hähnchen verteilen und etwas Wasser (ca. 1 Tasse) zugeben.", "Den Bratschlauch so verschließen, dass genügend Platz ist. Den Schlauch oben ca. 1cm lang einschneiden.", "Im Ofen auf der unteren Schiene ca. 60-70 Minuten braten.", "Für die Soße: Den Bratsud aus dem Schlauch zur dunklen Soße geben. Evtl. mit Fruchtsaft und Thymian nachwürzen.", "Hähnchen tranchieren und mit Walnüssen und Früchten umlegt servieren.", "Als Beilage Rotkohl und Knödel oder Klöße."],
    notes: "",
    ingredients: [
      { amount: "1", unit: "kg", name: "Hähnchen" }, { amount: "250", unit: "g", name: "Walnüsse, mit Schale" },
      { amount: "100", unit: "g", name: "Rosinen und getr. Pflaumen" }, { amount: "1", unit: "große", name: "Birne oder Apfel" },
      { amount: "2", unit: "Pck.", name: "Sauce, für 500ml, dunkle" }, { amount: "2", unit: "TL", name: "Honig" },
      { amount: "½", unit: "Tasse", name: "Sirup, Fruchtsirip (z.B. Grenadine)" }, { amount: "½", unit: "Tasse", name: "Cognac" },
      { amount: "", unit: "", name: "Olivenöl, Salz und Pfeffer, Thymian, Paprikapulver" }, { amount: "500", unit: "g", name: "Rotkohl" },
    ],
  },
  {
    id: "5", title: "Hackbraten vom Blech", servings: 4,
    prepTime: "ca. 15 Minuten", totalTime: "ca. 45 Minuten", difficulty: "normal",
    category: "Fleisch", kcalPerPortion: 762, source: "juliabäcker / Chefkoch",
    steps: ["Die Paprikaschoten putzen, in kleine Würfel schneiden und beiseite stellen.", "Alle anderen Zutaten in einer großen Schüssel miteinander vermengen.", "Gut durchkneten, am Schluss etwa die Hälfte der gemischten Paprikawürfel unterkneten.", "Den Fleischteig auf ein gut gefettetes oder mit Backpapier belegtes Backblech streichen.", "Die restlichen Paprikawürfel darauf streuen und etwas eindrücken.", "Im heißen Backofen ca. 25-30 Minuten bei 200°C Heißluft backen.", "Warm essen oder erkalten lassen, in kleine Rechtecke schneiden und servieren mit Kartoffelsalat und Brot.", "Schmeckt auch kalt am Partybuffet!"],
    notes: "Tipp: Bei den Gewürzen kann man variieren, auch Knoblauch und Chilipulver dazugeben. Zur Abwechslung auch Maiskörner oder Champignons untermischen.",
    ingredients: [
      { amount: "500", unit: "g", name: "Hackfleisch, gemischtes" }, { amount: "4", unit: "m.-große", name: "Eier" },
      { amount: "50", unit: "g", name: "Semmelbrösel" }, { amount: "3", unit: "TL", name: "Senf, mittelscharfer" },
      { amount: "1", unit: "TL", name: "Paprikapulver, rosenscharfes" }, { amount: "", unit: "", name: "Salz und Pfeffer" },
      { amount: "3", unit: "TL", name: "Tomatenmark" }, { amount: "n. B.", unit: "", name: "Petersilie" },
      { amount: "3", unit: "kleine", name: "Paprikaschoten, bunte" }, { amount: "300", unit: "g", name: "Käse, geriebener, Sorte nach Geschmack" },
      { amount: "evtl.", unit: "", name: "Fett für das Blech" },
    ],
  },
  {
    id: "6", title: "Gyrosauflauf mit Sauce Hollandaise", servings: 4,
    prepTime: "ca. 40 Minuten", totalTime: "ca. 40 Minuten", difficulty: "simpel",
    category: "Fleisch", source: "Maja72 / Chefkoch",
    steps: ["Die Nudeln bissfest kochen.", "Die Knoblauchzehe klein schneiden und in die heiße Pfanne mit etwas Öl geben.", "Nach kurzem Anschwitzen das Fleisch darin scharf anbraten.", "Wenn das Fleisch schön gebräunt ist, die Zwiebeln hinzu geben. Wenn die Zwiebeln glasig sind, das Fleisch vom Herd nehmen.", "Wenn die Nudeln fertig sind, diese abgießen, in eine Auflaufform geben und eine Lage Käse darauf streuen.", "Darauf kommt das Fleisch und dann der restliche Käse.", "Jetzt gießt man die Sauce Hollandaise über alles und schiebt die Form in einen auf 210 Grad vorgeheizten Backofen für ca. 20 Minuten.", "Der Käse sollte schön zerlaufen sein und eine leichte Bräune haben."],
    notes: "",
    ingredients: [
      { amount: "300", unit: "g", name: "Nudeln, Spiralen" }, { amount: "750", unit: "g", name: "Schweinefleisch, geschnetzeltes, fertig gewürzt nach Gyros Art" },
      { amount: "4", unit: "große", name: "Zwiebeln" }, { amount: "1", unit: "", name: "Knoblauchzehe" },
      { amount: "2", unit: "Becher", name: "Sauce Hollandaise" }, { amount: "2", unit: "Beutel", name: "Käse, geriebener (Emmentaler, Gouda oder Parmesan)" },
      { amount: "", unit: "", name: "Öl" },
    ],
  },
  {
    id: "7", title: "Putenschnitzel in Käse-Lauch-Sauce mit Rösti überbacken", servings: 4,
    prepTime: "ca. 15 Minuten", totalTime: "ca. 40 Minuten", difficulty: "simpel",
    category: "Geflügel", rating: "lecker", lastCooked: "02.02.26", source: "majon38 / Chefkoch",
    steps: ["Die Putenschnitzel schnetzeln, salzen und pfeffern und kurz anbraten.", "Das gebratene Fleisch in eine Auflaufform geben.", "Den Lauch putzen und in Ringe schneiden, mit dem Öl in derselben Pfanne anschwitzen.", "Den Schmelzkäse und die Sahne hinzugeben, kurz aufkochen lassen und das Ganze mit einem guten Schuss Wein ablöschen.", "Das Käse-Lauch-Gemisch über das Fleisch in die Auflaufform geben.", "Die angetauten Rösti darüber bröseln und für ca. 25 Minuten bei 180°C in den Backofen schieben.", "Dazu passt Baguette."],
    notes: "Handschriftlich: kräftig würzen! Weißwein od. Zitronensaft. Notiz 2.2.26: sehr lecker!",
    ingredients: [
      { amount: "4", unit: "", name: "Putenschnitzel", note: "oder Säurefilet" }, { amount: "2", unit: "Stange", name: "Porree", note: "= 400g, vorher garen komplett" },
      { amount: "300", unit: "ml", name: "Schmelzkäse mit Kräutern" }, { amount: "200", unit: "ml", name: "Sahne" },
      { amount: "", unit: "", name: "Öl" }, { amount: "1", unit: "Schuss", name: "Weißwein", note: "oder Zitronensaft" },
      { amount: "", unit: "", name: "Salz und Pfeffer" }, { amount: "1", unit: "Tüte", name: "Rösti (TK)" },
    ],
  },
  {
    id: "8", title: "Lachs mit Rübenstampf und Knusperspeck", servings: 4,
    prepTime: "ca. 45 Minuten", totalTime: "ca. 45 Minuten", difficulty: "normal",
    category: "Fisch", source: "eat_club / Zeitschrift",
    steps: ["Steckrübe schälen und klein schneiden. In kochendem Salzwasser ca. 30 Minuten weich kochen.", "Spinat verlesen, waschen und abtropfen lassen. Joghurt mit Salz und Pfeffer abschmecken.", "Lauchzwiebeln putzen, waschen und in feine Ringe schneiden. 1 EL Öl in einer beschichteten Pfanne erhitzen.", "Speck darin knusprig auslassen. Lauchzwiebelringe ca. 1 Minute mitbraten. Herausnehmen, mit Essig und 2 EL Öl verrühren. Mit Pfeffer und wenig Salz abschmecken.", "Lachs trocken tupfen, mit Salz würzen. Im heißen Speckfett von jeder Seite ca. 5 Minuten bei mittlerer Hitze braten.", "Rüben abgießen, kurz ausdampfen lassen. Mit Salz und 1 TL Chiliflocken würzen. 2 EL Öl zufügen und fein zerstampfen. Spinat unterheben.", "Rübenstampf mit Lachs, Specktopping und je 1 Klecks Joghurt anrichten. Mit Chiliflocken und Kresse bestreuen."],
    notes: "Pro Portion ca. 50g E, 27g F, 11g KH, 480 kcal. Empfehlung: Wildlachs aus Alaska oder Kanada sowie Bio-Zuchtlachs.",
    ingredients: [
      { amount: "1", unit: "Steckrübe", name: "ca. 1kg" }, { amount: "", unit: "", name: "Salz, Pfeffer" },
      { amount: "100", unit: "g", name: "Babyspinat" }, { amount: "150", unit: "g", name: "griechischer Sahnejoghurt" },
      { amount: "2", unit: "", name: "Lauchzwiebeln" }, { amount: "5", unit: "EL", name: "Öl" },
      { amount: "100", unit: "g", name: "Speckwürfel" }, { amount: "4", unit: "", name: "Lachsfilets, à ca. 200g" },
      { amount: "1", unit: "TL", name: "Chiliflocken + etwas" }, { amount: "", unit: "", name: "Shisokresse" },
    ],
  },
  {
    id: "9", title: "Türkischer Hackfleischauflauf mit Schafskäse", servings: 4,
    prepTime: "ca. 20 Minuten", totalTime: "ca. 1 Stunde", difficulty: "normal",
    category: "Fleisch", rating: "sehr lecker", lastCooked: "15.03.26", kcalPerPortion: 824,
    source: "nikalo / Chefkoch",
    steps: ["Die Schafskäsewürfel in ein Sieb gießen und das Öl dabei auffangen.", "Die Champignons in Scheiben schneiden. Die Paprikaschoten putzen und in Streifen schneiden. Den Knoblauch abziehen und fein hacken.", "In ca. 3 EL von dem aufgefangenen Öl das Hackfleisch braun und krümelig braten.", "Die Hälfte der Champignons dazugeben und mit anbraten. Nun auch die Paprikastreifen und den Knoblauch dazugeben und anbraten.", "Nach ca. 5 Minuten die Crème fraîche und den Oregano einrühren und mit Salz und Pfeffer würzig abschmecken.", "Alles in eine feuerfeste Form geben und die restlichen Champignons darauf verteilen.", "Zuletzt die abgetropften Schafskäsewürfel sowie den zerbröstelten Schafskäse darauf streuen.", "Den Auflauf ca. 20-30 Minuten im heißen Backofen bei 180°C Umluft backen.", "Dazu passt Tzatziki, Fladenbrot und/oder Reis. Auf jeden Fall Salat!"],
    notes: "Handschriftlich: realphisd, mit Schafsenkäse. Notiz: für Herrenabend. 15.3.26 sehr lecker! Mit VK-Nudeln. Öl ruhig mehr, um das Schmirige auszugleichen.",
    ingredients: [
      { amount: "1", unit: "Glas", name: "Schafskäse (Würfel in Öl)", note: "ca. 150-200g" },
      { amount: "600", unit: "g", name: "Rinderhackfleisch oder Lammhackfleisch" },
      { amount: "500", unit: "g", name: "Champignons, frische", note: "ca. 350g Glas, besser frische" },
      { amount: "2", unit: "", name: "Paprikaschoten, rote und grüne" }, { amount: "2", unit: "", name: "Knoblauchzehen" },
      { amount: "300", unit: "g", name: "Crème fraîche", note: "450g Schmand" }, { amount: "2½", unit: "TL", name: "Oregano, getrockneter" },
      { amount: "200", unit: "g", name: "Schafskäse am Stück" }, { amount: "", unit: "", name: "Salz und Pfeffer, frisch gemahlener" },
      { amount: "", unit: "", name: "Öl, ruhig mehr, um das Schmirige auszugleichen" },
    ],
  },
  {
    id: "10", title: "Vegetarische Linsen-Bolognese", servings: 4,
    prepTime: "ca. 25 Minuten", totalTime: "ca. 1 Stunde 5 Minuten", difficulty: "normal",
    category: "Vegetarisch", kcalPerPortion: 154, source: "eichkatzerl / Chefkoch",
    steps: ["Die Zwiebel, den Knoblauch und die Möhren schälen und klein schneiden. Die Linsen waschen.", "Das Öl in einem Topf erhitzen und nacheinander Zwiebeln, Möhren, Linsen, Knoblauch, Tomatenmark und Gewürze zugeben und darin anschwitzen.", "Das Ganze mit Wasser oder Brühe ablöschen. Evtl. noch Salz, Brühepulver, Zucker und Rotwein dazugeben.", "Die Sauce nach Boloneser Art nun ca. 30 bis 40 Minuten bei leicht geöffnetem Deckel köcheln lassen.", "Wenn nötig, noch Flüssigkeit hinzufügen. Die Sauce sollte nicht zu flüssig sein.", "Am Ende der Kochzeit nach Bedarf mit den Kräutern und Gewürzen abschmecken.", "Schmeckt zu allen Nudelarten, Kartoffeln, und ist auch zum Befüllen von Pfannkuchen geeignet."],
    notes: "",
    ingredients: [
      { amount: "1", unit: "TL", name: "Öl" }, { amount: "1", unit: "", name: "Zwiebel" },
      { amount: "2", unit: "", name: "Möhren" }, { amount: "120", unit: "g", name: "Linsen, rote" },
      { amount: "2", unit: "", name: "Knoblauchzehen" }, { amount: "2", unit: "EL", name: "Tomatenmark" },
      { amount: "", unit: "", name: "Paprikapulver, Cayennepfeffer, Basilikum, Rosmarin" },
      { amount: "1", unit: "Liter", name: "Wasser oder Brühe" }, { amount: "n. B.", unit: "", name: "Salz" },
      { amount: "evtl.", unit: "", name: "Brühepulver (wenn Wasser verwendet wird)" },
      { amount: "n. B.", unit: "", name: "Zucker" }, { amount: "n. B.", unit: "", name: "Rotwein" },
    ],
  },
  {
    id: "11", title: "Kichererbsen-Curry", servings: 4,
    prepTime: "ca. 10 Minuten", totalTime: "ca. 25 Minuten", difficulty: "normal",
    category: "Vegetarisch", kcalPerPortion: 357, source: "alexandradugas / Chefkoch",
    steps: ["Paprika in feine Streifen und Frühlingszwiebeln in Scheiben schneiden.", "Paprika, Zwiebeln und Kichererbsen in Öl anbraten.", "Currypaste unterrühren, mit Kokosmilch und Gemüsebrühe ablöschen und 10 Minuten köcheln lassen.", "Curry mit Limettensaft und Salz abschmecken.", "Dazu passt Basmatireis."],
    notes: "",
    ingredients: [
      { amount: "3", unit: "", name: "Paprikaschoten, rote" }, { amount: "½", unit: "Bund", name: "Frühlingszwiebeln" },
      { amount: "1", unit: "Dose", name: "Kichererbsen, ca. 340g Abtropfgewicht" }, { amount: "2", unit: "EL", name: "Öl" },
      { amount: "1", unit: "EL", name: "Currypaste, grüne" }, { amount: "200", unit: "ml", name: "Kokosmilch" },
      { amount: "200", unit: "ml", name: "Gemüsebrühe" }, { amount: "", unit: "", name: "Salz und Pfeffer" },
      { amount: "½", unit: "", name: "Limette, Saft davon" },
    ],
  },
  {
    id: "12", title: "Nudeln mit Spinatsoße", servings: 4,
    prepTime: "ca. 10 Minuten", totalTime: "ca. 30 Minuten", difficulty: "simpel",
    category: "Vegetarisch", kcalPerPortion: 751, source: "ChPhTh / Chefkoch",
    steps: ["Den Spinat auftauen. Die Nudeln wie gewohnt im Salzwasser kochen und abgießen.", "Inzwischen die Zwiebel würfeln und in Öl glasig anschwitzen.", "Den Spinat zu den Zwiebelwürfeln geben, etwas brutzeln lassen und mit Salz, Pfeffer und Muskat abschmecken.", "Den Schmand zugeben, aufkochen lassen und nun den Schmelzkäse zugeben und schmelzen lassen.", "Falls die Soße zu flüssig ist, mit Saucenbinder eindicken.", "Die Nudeln in die Soße geben oder die Soße separat servieren."],
    notes: "",
    ingredients: [
      { amount: "450", unit: "g", name: "Blattspinat (TK)" }, { amount: "1", unit: "", name: "Zwiebel" },
      { amount: "1", unit: "Becher", name: "Schmand" }, { amount: "150", unit: "g", name: "Kräuterschmelzkäse" },
      { amount: "", unit: "", name: "Salz und Pfeffer, Muskat" }, { amount: "evtl.", unit: "", name: "Saucenbinder, heller" },
      { amount: "500", unit: "g", name: "Nudeln" }, { amount: "", unit: "", name: "Salzwasser" },
    ],
  },
  {
    id: "13", title: "Grüne Nudeln mit Thunfischsoße", servings: 4,
    prepTime: "ca. 15 Minuten", totalTime: "ca. 30 Minuten", difficulty: "simpel",
    category: "Pasta", kcalPerPortion: 862, source: "krauti58 / Chefkoch",
    steps: ["Die Nudeln bissfest kochen.", "Für die Soße die gewürfelten Zwiebeln und den ebenfalls gewürfelten Knoblauch in heißem Öl glasig dünsten.", "Thunfisch mit Flüssigkeit, Sahne und Kapern dazugeben. Einmal aufkochen.", "Mit der Speisestärke binden und mit Salz, Pfeffer, Zitronensaft und -schale abschmecken.", "Soße über die Nudeln geben und servieren."],
    notes: "",
    ingredients: [
      { amount: "350", unit: "g", name: "Bandnudeln, grün" }, { amount: "2", unit: "", name: "Zwiebeln" },
      { amount: "1", unit: "", name: "Knoblauchzehe" }, { amount: "1", unit: "EL", name: "Olivenöl" },
      { amount: "2", unit: "Dose", name: "Thunfisch, naturell" }, { amount: "250", unit: "ml", name: "Schlagsahne" },
      { amount: "1", unit: "Glas", name: "Kapern, Abtropfgewicht 35g" }, { amount: "1", unit: "TL", name: "Speisestärke" },
      { amount: "½", unit: "", name: "Zitrone, der Saft und Schalenabrieb davon" }, { amount: "", unit: "", name: "Salz und Pfeffer" },
    ],
  },
];

export async function seedRecipes() {
  const existing = await db.select({ id: recipesTable.id }).from(recipesTable).limit(1);
  if (existing.length > 0) {
    return;
  }

  for (const recipe of RECIPES_DATA) {
    const { ingredients, id: _id, ...recipeData } = recipe;
    const [inserted] = await db.insert(recipesTable).values({
      title: recipeData.title,
      servings: recipeData.servings ?? null,
      prepTime: recipeData.prepTime ?? null,
      totalTime: recipeData.totalTime ?? null,
      difficulty: recipeData.difficulty,
      category: recipeData.category,
      rating: recipeData.rating ?? null,
      kcalPerPortion: recipeData.kcalPerPortion ?? null,
      source: recipeData.source ?? null,
      lastCooked: recipeData.lastCooked ?? null,
      cookedCount: recipeData.cookedCount ?? 0,
      notes: recipeData.notes || null,
      steps: recipeData.steps,
    }).returning();

    if (ingredients && ingredients.length > 0) {
      await db.insert(recipeIngredientsTable).values(
        ingredients.map((ing) => ({
          recipeId: inserted.id,
          amount: ing.amount || "",
          unit: ing.unit || "",
          name: ing.name,
          note: ing.note ?? null,
        }))
      );
    }
  }

  console.log("Seeded 13 recipes successfully.");
}
