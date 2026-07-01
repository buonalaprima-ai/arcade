# 🎮 Buonalaprima Arcade

Mini collezione di giochi web "da tram": una mano sola, sessioni brevi, niente account, offline-friendly. Tutti single-file, zero dipendenze esterne, fatti con AI.

## Giochi

| Gioco | Stato | Meccanica |
|-------|-------|-----------|
| 🥞 [Torre di Pancake](pancake-tower/) | ✅ live | Tocca a tempo per impilare i pancake senza farli cadere |
| 🍳 Merge Cucina | 🔜 presto | Unisci ingredienti che si evolvono lungo una ricetta |
| 🍣 Sushi Match | 🔜 presto | Match-3 di bocconcini |

## Struttura

```
arcade/
├── index.html            # hub / menu della collezione
└── pancake-tower/
    └── index.html        # gioco completo single-file
```

Ogni gioco è una cartella con un singolo `index.html` autosufficiente (HTML + CSS + JS inline, niente build, niente librerie). L'hub linka i giochi e mostra le tile "presto" dei prossimi.

## Pubblicazione

Pensato per GitHub Pages: l'hub è la root, ogni gioco vive in una sottocartella.
