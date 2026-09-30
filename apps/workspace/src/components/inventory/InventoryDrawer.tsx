import Drawer from '../ui/Drawer';
import InventoryPanel from './InventoryPanel';

export default function InventoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title="Inventory" position="right" defaultSize="large" portal>
      <InventoryPanel />
    </Drawer>
  );
}
