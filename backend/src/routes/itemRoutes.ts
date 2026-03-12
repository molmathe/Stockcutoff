import { Router } from 'express';
import multer from 'multer';
import { downloadCSVTemplate, uploadImages, createItem, updateItem, deleteItem, getItem } from '../controllers/itemController';

const router = Router();
const upload = multer({ dest: 'uploads/' }); // Define destination for uploaded files

// Item CRUD routes
router.post('/items', createItem); // Create an item
router.get('/items/:id', getItem); // Get an item
router.put('/items/:id', updateItem); // Update an item
router.delete('/items/:id', deleteItem); // Delete an item

// Bulk image upload route with barcode matching
router.post('/items/upload-images', upload.array('images'), uploadImages);

// CSV template download route
router.get('/items/download-template', downloadCSVTemplate);

export default router;