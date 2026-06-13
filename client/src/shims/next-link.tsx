import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

type NextLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: React.ReactNode;
};

export default function Link({ href, children, ...props }: NextLinkProps) {
  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  );
}
