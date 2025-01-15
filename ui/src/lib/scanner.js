import { pb } from './pocketbase';
import { showAlert } from './store';

export async function triggerScan() {
  try {
    const response = await pb.send('/api/scan-courses', {
      method: 'POST',
    });
    
    if (response.success) {
      showAlert('Courses scanned successfully', 'success');
      // Refresh the courses data
      await pb.collection('courses').getFullList();
    } else {
      showAlert('Failed to scan courses', 'fail');
    }
  } catch (error) {
    showAlert('Error scanning courses: ' + error.message, 'fail');
  }
}
