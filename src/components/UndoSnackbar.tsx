import { Snackbar, Button, SnackbarCloseReason } from '@mui/material';
import { SyntheticEvent } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onUndo: () => void;
}

export default function UndoSnackbar({ open, onClose, onUndo }: Props) {
  const handleClose = (event: Event | SyntheticEvent, reason?: SnackbarCloseReason) => {
    // Don't close on clickaway to prevent accidental closure
    if (reason === 'clickaway') {
      return;
    }
    onClose();
  };

  const handleUndoClick = () => {
    onUndo();
    // Don't call onClose here as undoDelete already clears the lastDeleted
  };

  return (
    <Snackbar
      open={open}
      onClose={handleClose}
      autoHideDuration={4000}
      message="Task deleted"
      action={
        <Button 
          color="secondary" 
          size="small" 
          onClick={handleUndoClick}
        >
          Undo
        </Button>
      }
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      TransitionProps={{
        onExited: onClose, // Ensure cleanup when animation completes
      }}
    />
  );
}


