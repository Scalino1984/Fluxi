// 1. Logger-Klasse
class Logger {
    static isDebugMode = false;

    static debug(message, data = null) {
        if (this.isDebugMode) {
            console.log(`[Debug] ${message}`, data || '');
        }
    }

    static error(message, error = null) {
        console.error(`[Error] ${message}`, error || '');
    }

    static initializeDebugMode() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            this.isDebugMode = urlParams.has('debug');
        } catch (error) {
            console.error('Fehler beim Initialisieren des Debug-Modus:', error);
            this.isDebugMode = false;
        }
    }
}

// 2. Utils
const utils = {
    showLoading() {
        if (document.body) {
            document.body.classList.add('loading');
            Logger.debug('Loading-Status aktiviert');
        } else {
            Logger.error('document.body nicht verfügbar');
        }
    },

    hideLoading() {
        if (document.body) {
            document.body.classList.remove('loading');
            Logger.debug('Loading-Status deaktiviert');
        } else {
            Logger.error('document.body nicht verfügbar');
        }
    },

    safeGetElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            Logger.error(`Element mit ID '${id}' nicht gefunden`);
            return null;
        }
        return element;
    },

    async withLoading(asyncFn) {
        try {
            this.showLoading();
            await asyncFn();
        } finally {
            this.hideLoading();
        }
    }
};

// In der ImageModal-Klasse:
class ImageModal {
    constructor() {
        this.modal = null;
        this.modalImg = null;
        this.initialize();
    }

    initialize() {
        if (typeof bootstrap === 'undefined') {
            Logger.error('Bootstrap ist nicht verfügbar');
            return;
        }

        const modalElement = utils.safeGetElement('imageModal');
        if (!modalElement) return;

        this.modal = new bootstrap.Modal(modalElement);
        this.modalImg = utils.safeGetElement('modalImage');
        
        // Event-Listener für Modal-Schließen
        modalElement.addEventListener('hidden.bs.modal', () => {
            this.cleanupModal();
        });

        // Klick-Handler für Modal-Container
        const imageContainer = document.querySelector('.image-container');
        if (imageContainer && this.modalImg) {
            imageContainer.addEventListener('click', (e) => {
                if (e.target === this.modalImg) {
                    this.hide();
                }
            });
        }

        // Download-Button Handler
        const downloadBtn = utils.safeGetElement('modalDownloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                const filename = this.modalImg?.dataset?.filename;
                if (filename) {
                    await this.downloadImage(filename);
                } else {
                    Logger.error('Kein Dateiname für Download verfügbar');
                }
            });
        }
    }

	// In der ImageModal Klasse
	async downloadImage(filename) {
		await utils.withLoading(async () => {
			try {
				const response = await fetch('/flux-pics/single', {
					method: 'POST',  // Hier müssen wir die richtige Methode verwenden
					headers: { 
						'Content-Type': 'application/json',
						// Eventuell benötigte zusätzliche Header
						'Accept': 'application/octet-stream'
					},
					body: JSON.stringify({ filename })
				});
	
				if (!response.ok) {
					// Wenn der Download trotzdem funktioniert hat, unterdrücken wir die Fehlermeldung
					if (response.status === 405 && response.headers.get('content-disposition')) {
						Logger.debug('Download erfolgreich trotz 405 Status');
					} else {
						throw new Error(`HTTP error! status: ${response.status}`);
					}
				}
	
				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.style.display = 'none';
				a.href = url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				window.URL.revokeObjectURL(url);
				document.body.removeChild(a);
			} catch (error) {
				// Nur einen Fehler anzeigen, wenn der Download wirklich fehlgeschlagen ist
				if (!document.querySelector(`[download="${filename}"]`)) {
					Logger.error('Download-Fehler:', error);
					alert('Ein Fehler ist beim Download aufgetreten: ' + error.message);
				}
			}
		});
	}

    open(img) {
        if (!this.modal || !this.modalImg) {
            Logger.error('Modal nicht korrekt initialisiert');
            return;
        }

        Logger.debug('Öffne Bild-Modal', img);
        
        this.modalImg.src = img.src;
        this.modalImg.dataset.filename = img.dataset.filename;

        const metadataFields = ['format', 'timestamp', 'album', 'category', 'prompt', 'optimized_prompt'];
        metadataFields.forEach(field => {
            const element = utils.safeGetElement(`modal${field.charAt(0).toUpperCase() + field.slice(1)}`);
            if (element) {
                element.textContent = img.dataset[field] || 'Nicht verfügbar';
            }
        });

        this.modal.show();
    }

    hide() {
        this.modal?.hide();
    }

    cleanupModal() {
        document.body.classList.remove('modal-open');
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }
}

class GalleryManager {
    constructor() {
        this.selectedImages = new Set();
        this.imageModal = new ImageModal();
        this.initialize();
    }

    initialize() {
        this.initializeSelectionHandling();
        this.initializeGalleryViews();
        this.initializeDownloadHandling();
    }

    initializeSelectionHandling() {
        // "Alle auswählen" Funktionalität
        const selectAllCheckbox = utils.safeGetElement('selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', () => {
                const itemCheckboxes = document.querySelectorAll('.select-item');
                itemCheckboxes.forEach(checkbox => {
                    checkbox.checked = selectAllCheckbox.checked;
                    this.updateSelectedImages(checkbox);
                });
            });
        }

        // Einzelne Bildauswahl
        document.querySelectorAll('.select-item').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateSelectedImages(checkbox));
        });
    }

    updateSelectedImages(checkbox) {
        const card = checkbox.closest('.card');
        if (!card) return;

        const img = card.querySelector('img');
        if (!img || !img.dataset.filename) {
            Logger.error('Ungültiges Bild-Element in der Karte');
            return;
        }

        if (checkbox.checked) {
            this.selectedImages.add(img.dataset.filename);
        } else {
            this.selectedImages.delete(img.dataset.filename);
        }

        Logger.debug(`Ausgewählte Bilder aktualisiert: ${this.selectedImages.size} Bilder`);
    }

    getSelectedImages() {
        return Array.from(this.selectedImages);
    }

    initializeGalleryViews() {
        // Thumbnail-Galerie
        const thumbGalleryBtn = utils.safeGetElement('thumbgalleryBtn');
        if (thumbGalleryBtn) {
            thumbGalleryBtn.addEventListener('click', () => this.openThumbnailGallery());
        }

        // Grid Layout
        const gridLayout = utils.safeGetElement('gridLayout');
        if (gridLayout) {
            gridLayout.addEventListener('change', () => this.updateGridLayout(gridLayout.value));
        }

        // Bild-Thumbnails
        document.querySelectorAll('.image-thumbnail').forEach(img => {
            img.addEventListener('click', () => this.imageModal.open(img));
        });
    }

    async openThumbnailGallery() {
        const selectedImages = this.getSelectedImages();
        if (selectedImages.length === 0) {
            alert('Keine Bilder ausgewählt.');
            return;
        }

        const galleryModal = new bootstrap.Modal(utils.safeGetElement('thumbGalleryModal'));
        const container = utils.safeGetElement('thumbGalleryContainer');
        if (!container) return;

        container.innerHTML = '';

        selectedImages.forEach(filename => {
            const thumbContainer = this.createThumbnailElement(filename);
            if (thumbContainer) {
                container.appendChild(thumbContainer);
            }
        });

        galleryModal.show();
    }

    createThumbnailElement(filename) {
        const container = document.createElement('div');
        container.className = 'thumb-container m-2';

        const img = document.createElement('img');
        img.src = `/flux-pics/${filename}`;
        img.className = 'img-thumbnail thumbnail-img';
        img.dataset.filename = filename;
        img.style.maxWidth = '150px';
        img.style.cursor = 'pointer';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-sm btn-primary download-thumb';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i>';

        // Event-Listener
        img.addEventListener('click', () => this.imageModal.open(img));
        downloadBtn.addEventListener('click', async () => {
            await this.imageModal.downloadImage(filename);
        });

        container.appendChild(img);
        container.appendChild(downloadBtn);

        return container;
    }

    updateGridLayout(columns) {
        const imageGrid = utils.safeGetElement('imageGrid');
        if (imageGrid) {
            const validColumns = Math.max(1, Math.min(6, parseInt(columns) || 3));
            imageGrid.className = `row row-cols-1 row-cols-md-${validColumns}`;
            Logger.debug(`Grid-Layout aktualisiert: ${validColumns} Spalten`);
        }
    }

    initializeDownloadHandling() {
        const downloadBtn = utils.safeGetElement('downloadSelected');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.handleBulkDownload());
        }
    }

    async handleBulkDownload() {
        const selectedImages = this.getSelectedImages();
        if (selectedImages.length === 0) {
            alert('Keine Bilder ausgewählt.');
            return;
        }

        const useZip = selectedImages.length > 1 && 
            confirm('Möchten Sie die Bilder als ZIP-Datei herunterladen?\nKlicken Sie "OK" für ZIP oder "Abbrechen" für Einzeldownloads.');

        await utils.withLoading(async () => {
            try {
                if (useZip) {
                    await this.downloadAsZip(selectedImages);
                } else {
                    await this.downloadIndividually(selectedImages);
                }
                alert('Download erfolgreich abgeschlossen.');
            } catch (error) {
                Logger.error('Bulk-Download Fehler:', error);
                alert('Ein Fehler ist aufgetreten: ' + error.message);
            }
        });
    }

    async downloadAsZip(files) {
        const response = await fetch('/flux-pics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedImages: files })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'images.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    async downloadIndividually(files) {
        for (const filename of files) {
            await this.imageModal.downloadImage(filename);
            // Kleine Pause zwischen Downloads
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}
// Slideshow-Verwaltung
// In der SlideshowManager-Klasse:
class SlideshowManager {
    constructor(gallery) {
        if (!gallery) {
            Logger.error('GalleryManager ist erforderlich');
            throw new Error('GalleryManager ist erforderlich');
        }
        this.gallery = gallery;
        this.slideInterval = 3000;
        this.currentSlideIndex = 0;
        this.slideshowInterval = null;
        this.carousel = null;
        this.slideshowModal = null;
        
        // Initialisierung direkt im Konstruktor
        const slideshowBtn = utils.safeGetElement('slideshowBtn');
        if (slideshowBtn) {
            slideshowBtn.addEventListener('click', () => this.openSlideshow());
        }
    }

    async openSlideshow() {
        const selectedImages = this.gallery.getSelectedImages();
        if (selectedImages.length === 0) {
            alert('Keine Bilder ausgewählt.');
            return;
        }

        const modalElement = utils.safeGetElement('slideshowModal');
        if (!modalElement) return;

        this.slideshowModal = new bootstrap.Modal(modalElement);
        const container = utils.safeGetElement('slideshowContainer');
        if (!container) return;

        container.innerHTML = '';
        this.createSlides(container, selectedImages);

        const carouselElement = utils.safeGetElement('carouselExampleControls');
        if (carouselElement) {
            this.carousel = new bootstrap.Carousel(carouselElement, {
                interval: false
            });
        }

        // Event-Listener für Modal-Schließen
        modalElement.addEventListener('hidden.bs.modal', () => {
            this.cleanupSlideshow();
        });

        this.setupSlideshowControls();
        this.slideshowModal.show();
    }

    createSlides(container, images) {
        images.forEach((filename, index) => {
            const div = document.createElement('div');
            div.classList.add('carousel-item');
            if (index === 0) div.classList.add('active');

            const img = document.createElement('img');
            img.src = `/flux-pics/${filename}`;
            img.classList.add('d-block', 'w-100');
            img.dataset.filename = filename;

            div.appendChild(img);
            container.appendChild(div);
        });
    }

    setupSlideshowControls() {
        const playBtn = utils.safeGetElement('playSlideshow');
        const pauseBtn = utils.safeGetElement('pauseSlideshow');

        if (playBtn && pauseBtn) {
            playBtn.addEventListener('click', () => this.startSlideshow());
            pauseBtn.addEventListener('click', () => this.pauseSlideshow());
        }

        const fullscreenBtn = utils.safeGetElement('fullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        }

        const downloadBtn = utils.safeGetElement('downloadCurrentSlide');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadCurrentSlide());
        }
    }

    startSlideshow() {
        if (!this.carousel) return;

        this.slideshowInterval = setInterval(() => {
            this.carousel.next();
        }, this.slideInterval);

        const playBtn = utils.safeGetElement('playSlideshow');
        const pauseBtn = utils.safeGetElement('pauseSlideshow');
        if (playBtn && pauseBtn) {
            playBtn.style.display = 'none';
            pauseBtn.style.display = 'block';
        }
    }

    pauseSlideshow() {
        if (this.slideshowInterval) {
            clearInterval(this.slideshowInterval);
            this.slideshowInterval = null;
        }

        const playBtn = utils.safeGetElement('playSlideshow');
        const pauseBtn = utils.safeGetElement('pauseSlideshow');
        if (playBtn && pauseBtn) {
            pauseBtn.style.display = 'none';
            playBtn.style.display = 'block';
        }
    }

    async toggleFullscreen() {
        const modalElement = utils.safeGetElement('slideshowModal');
        if (!modalElement) return;

        try {
            if (!document.fullscreenElement) {
                if (modalElement.requestFullscreen) {
                    await modalElement.requestFullscreen();
                } else if (modalElement.webkitRequestFullscreen) {
                    await modalElement.webkitRequestFullscreen();
                } else if (modalElement.msRequestFullscreen) {
                    await modalElement.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                }
            }
        } catch (error) {
            Logger.error('Vollbild-Fehler:', error);
        }
    }

    async downloadCurrentSlide() {
        const activeSlide = document.querySelector('.carousel-item.active img');
        if (activeSlide?.dataset?.filename) {
            await this.gallery.imageModal.downloadImage(activeSlide.dataset.filename);
        } else {
            Logger.error('Kein aktives Bild gefunden');
        }
    }

    cleanupSlideshow() {
        this.pauseSlideshow();
        
        document.body.classList.remove('modal-open');
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
        
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => {
                Logger.error('Fehler beim Beenden des Vollbildmodus:', err);
            });
        }
    }
}
// 3. AppInitializer-Klasse
class AppInitializer {
    constructor() {
        this.gallery = null;
        this.slideshow = null;
    }

    initialize() {
        try {
            Logger.initializeDebugMode();
            
            document.addEventListener('DOMContentLoaded', () => {
                try {
                    this.initializeComponents();
                    this.setupGlobalEventListeners();
                    Logger.debug('Anwendung erfolgreich initialisiert');
                } catch (error) {
                    Logger.error('Fehler bei der Initialisierung:', error);
                    alert('Es gab ein Problem beim Laden der Anwendung. Bitte laden Sie die Seite neu.');
                }
            });
        } catch (error) {
            console.error('Kritischer Fehler bei der Initialisierung:', error);
        }
    }

    initializeComponents() {
        try {
            this.gallery = new GalleryManager();
            this.slideshow = new SlideshowManager(this.gallery);
            Logger.debug('Komponenten initialisiert');
        } catch (error) {
            Logger.error('Fehler bei der Komponenten-Initialisierung:', error);
            throw error;
        }
    }

    setupGlobalEventListeners() {
        try {
            this.setupScrollToTop();
            this.setupKeyboardNavigation();
            Logger.debug('Globale Event-Listener eingerichtet');
        } catch (error) {
            Logger.error('Fehler beim Einrichten der Event-Listener:', error);
            throw error;
        }
    }

    setupScrollToTop() {
        const scrollTopBtn = utils.safeGetElement('scrollTopBtn');
        if (scrollTopBtn) {
            window.addEventListener('scroll', () => {
                scrollTopBtn.style.display = window.scrollY > 300 ? 'block' : 'none';
            });

            scrollTopBtn.addEventListener('click', () => {
                window.scrollTo({ 
                    top: 0, 
                    behavior: 'smooth' 
                });
            });
        }
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => this.handleKeyboardNavigation(e));
    }

    handleKeyboardNavigation(e) {
        if (e.key === 'Escape') {
            this.closeAllModals();
        }
    }

    closeAllModals() {
        try {
            document.querySelectorAll('.modal.show').forEach(modalElement => {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                    this.cleanupModalEffects();
                }
            });
        } catch (error) {
            Logger.error('Fehler beim Schließen der Modals:', error);
        }
    }

    cleanupModalEffects() {
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(err => {
                Logger.error('Fehler beim Beenden des Vollbildmodus:', err);
            });
        }
    }

    checkBootstrapAvailability() {
        if (typeof bootstrap === 'undefined') {
            Logger.error('Bootstrap ist nicht verfügbar');
            return false;
        }
        return true;
    }
}

// 4. Anwendung starten
try {
    const app = new AppInitializer();
    app.initialize();
} catch (error) {
    console.error('Kritischer Fehler beim Erstellen der Anwendung:', error);
}
