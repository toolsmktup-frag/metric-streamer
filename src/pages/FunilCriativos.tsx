import { useParams } from 'react-router-dom';
import Criativos from './Criativos';

export default function FunilCriativos() {
  const { id } = useParams<{ id: string }>();
  return <Criativos funnelId={id} />;
}
