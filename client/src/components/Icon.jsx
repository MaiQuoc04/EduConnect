// Material Symbols Outlined icon, e.g. <Icon name="lock" />. Names: https://fonts.google.com/icons
export default function Icon({ name, size, filled, className = '', ...rest }) {
  const classes = ['icon', size === 'sm' && 'sm', filled && 'filled', className].filter(Boolean).join(' ');
  return (
    <span className={classes} aria-hidden="true" {...rest}>
      {name}
    </span>
  );
}
