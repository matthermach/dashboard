# FlowLens — dashboard czasów realizacji

Publiczna strona: https://matthermach.github.io/dashboard/

Ciemny, responsywny dashboard na podstawie `Lead Times - 2024-25.xlsx`.
Scatterplot rozróżnia kolorem S, M i L. Filtry można łączyć. Kliknięcie punktu
lub przycisku w tabeli wyklucza go z prognozy; ponowne kliknięcie przywraca.
Nie ma automatycznego usuwania outlierów.

Filtr **Data ukończenia** pozwala podać datę „Od”, „Do” lub obie i wybrać
**Zastosuj**. Granice są włączone do zakresu, a puste pole oznacza brak granicy.
Filtr działa razem z rozmiarami i wykluczeniami na wykres, prognozy oraz tabelę.
Odwrócony zakres jest odrzucany z komunikatem bez zmiany poprzedniej analizy.
**Wyczyść daty** usuwa tylko zakres dat; nie zmienia rozmiarów ani wykluczeń.
Zakres dat nie jest zapisywany po odświeżeniu ani w kopii JSON.
Eksport zawsze zawiera wszystkie punkty, również poza filtrami. Nowy punkt
spoza wybranego okresu jest zapisywany, ale nie jest widoczny do zmiany filtra.

P50, P85 i P95 są liczone dla aktywnych rozmiarów, dat i niewykluczonych punktów,
metodą interpolacji liniowej zgodną z Excel `PERCENTILE.INC`.
To percentyle historycznej próby, nie gwarancje terminu. Jednostka: dni.

## Tempo dostarczania — XMR

Zakładka **Tempo dostarczania · XMR** w `index.html` korzysta z osobnego pliku
`Throughput Daily.xlsx` (kolumny `Data (DD/MM/YYYY)` i `Przepustowość`).
Konwerter publikuje dzienne dane jako `throughput.json`; błędne daty,
duplikaty dni oraz ujemne, ułamkowe lub nieliczbowe wartości blokują publikację.
Nie są wymagane biblioteki do Excela ani wykresów.

Sumy tygodniowe X są liczone od **7 stycznia roku pierwszej daty w arkuszu**:
7–13 stycznia, 14–20 stycznia itd., bez resetowania na granicy roku.
Obecny arkusz rozpoczyna się 7 stycznia 2025 r. Dni wcześniejsze niż początek
analizy są pomijane. Sumujemy wartości przepustowości, nie liczbę rekordów.
MR to bezwzględna różnica dwóch kolejnych sum X; pierwszy okres nie ma MR.
Korytarz X: **średnia X ± 2,66 × średni MR**.
Korytarz MR: **średni MR ± 3,27 × średni MR**, zgodnie z wymaganym wzorem,
bez obcinania dolnej granicy do zera (nie jest to standardowa granica D3/D4).
Przy jednym tygodniu MR i korytarze nie są wyznaczane.

Ostatni okres oraz inne tygodnie z mniej niż 7 dniami danych są oznaczane jako
niepełne w tabeli, ostrzeżeniu i pustymi punktami na wykresie. Są uwzględniane
w średnich i granicach; brakujących dni nie ekstrapolujemy. Punkty poza
korytarzem są pomarańczowe. Tabela udostępnia dokładne sumy i MR.
Ta zakładka nie korzysta z filtrów, lokalnych dodatków ani wykluczeń analizy
czasów realizacji. Zakładki obsługują klawiaturę oraz adres `#throughput`.

## Dane i zapis

Formularz dodaje rozmiar, dodatni czas realizacji w dniach oraz datę ukończenia.
Nowe punkty i wykluczenia zapisują się w `localStorage` przeglądarki pod kluczem
`flowlens-dashboard-v1`. Nie zmieniają XLSX ani danych innych użytkowników.
Eksport JSON obejmuje pełną kopię danych i wykluczeń; import zastępuje ją po
potwierdzeniu. Przed czyszczeniem pamięci przeglądarki wykonaj eksport.
Uszkodzona lokalna kopia nie jest automatycznie nadpisywana.

Dane XLSX są konwertowane na `data.json` podczas publikacji. Kolumny pierwszego
arkusza: `Data ukończenia`, `Deklarowany rozmiar`, `Czas realizacji`.
Obsługiwane daty: polskie nazwy miesięcy (np. `15 Lipca 2024`), ISO `YYYY-MM-DD`
lub numery seryjne dat Excela (system 1900). Czas musi być dodatnią liczbą.
Nieprawidłowy wiersz blokuje publikację zamiast być po cichu pomijany.
Zmiana pliku XLSX i push na `main` automatycznie publikuje stronę.

Lokalna kopia zachowuje dotychczasowe dane; nowe rekordy XLSX są dołączane na
podstawie stabilnego identyfikatora treści. Zmieniony wiersz XLSX jest nowym
rekordem, a stary pozostaje w lokalnej kopii. Aby przejść wyłącznie na aktualny
arkusz, najpierw wyeksportuj kopię, a następnie usuń wskazany klucz `localStorage`.
Duplikaty wierszy w arkuszu są zachowane jako osobne obserwacje.

## Uruchomienie lokalne

Wymagania: Python 3.10+ i Node.js 18+ do testów. Brak zależności pakietowych.

```sh
python3 scripts/convert_xlsx.py
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m http.server 8000
```

Otwórz http://localhost:8000. Nie otwieraj bezpośrednio pliku HTML przez `file://`.
GitHub Pages publikuje workflow `.github/workflows/pages.yml`; w ustawieniach
repozytorium źródłem Pages powinno być **GitHub Actions**.
Wykres, obliczenia i dane nie wymagają zewnętrznych bibliotek ani usług.
Krój pisma jest pobierany z Google Fonts, z systemowym fontem zastępczym.

Publikacja uruchamia `python3 scripts/build_site.py`, który tworzy `_site/`.
Moduły źródłowe `.mjs` są publikowane jako `.js`, aby serwer podawał typ MIME
obsługiwany przez przeglądarki. Nazwy skryptów i CSS zawierają skrót zawartości;
zmiana modułu bazowego zmienia też adres skryptu aplikacji. Dzięki temu nowy
HTML nie korzysta ze starszych skryptów z pamięci podręcznej przeglądarki.
Aby odtworzyć publikację lokalnie, uruchom konwersję, budowanie i
`python3 -m http.server 8000 --directory _site`.
